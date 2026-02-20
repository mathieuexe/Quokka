import { z } from "zod";
import crypto from "node:crypto";
import { env } from "../config/env.js";
import { comparePassword, hashPassword } from "../utils/password.js";
import { createUser, findUserByEmail, findUserById, updateLastLogin, isUserAmongFirst100, getBadgeIdBySlug, assignBadgeToUser } from "../repositories/userRepository.js";
import { signAccessToken } from "../utils/jwt.js";
import { createVerificationCode, findVerificationCode, markVerificationCodeAsUsed, markEmailAsVerified, createTwoFactorCode, findTwoFactorCode, markTwoFactorCodeAsUsed, isTwoFactorEnabled } from "../repositories/verificationRepository.js";
import { sendEmail, generateVerificationCode, generateVerificationEmailTemplate, generate2FAEmailTemplate } from "../services/emailService.js";
let authentikDiscoveryCache = null;
async function getAuthentikDiscovery() {
    const issuer = env.AUTHENTIK_ISSUER;
    if (!issuer) {
        throw new Error("Authentik n'est pas configuré.");
    }
    const now = Date.now();
    if (authentikDiscoveryCache && authentikDiscoveryCache.issuer === issuer && now - authentikDiscoveryCache.fetchedAt < 10 * 60 * 1000) {
        return authentikDiscoveryCache.value;
    }
    const url = `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("Impossible de charger la configuration OIDC.");
    }
    const data = (await response.json());
    if (!data.authorization_endpoint || !data.token_endpoint || !data.userinfo_endpoint || !data.issuer) {
        throw new Error("Configuration OIDC invalide.");
    }
    const discovery = {
        issuer: data.issuer,
        authorization_endpoint: data.authorization_endpoint,
        token_endpoint: data.token_endpoint,
        userinfo_endpoint: data.userinfo_endpoint
    };
    authentikDiscoveryCache = { issuer, value: discovery, fetchedAt: now };
    return discovery;
}
function buildFrontendBaseUrl(req) {
    const origin = req.headers.origin;
    if (typeof origin === "string")
        return origin;
    return env.CORS_ORIGIN;
}
function buildStateJwt(payload) {
    const value = JSON.stringify({ ...payload, exp: Date.now() + 10 * 60 * 1000 });
    const encoded = Buffer.from(value, "utf-8").toString("base64url");
    const sig = crypto.createHmac("sha256", env.JWT_SECRET).update(encoded).digest("base64url");
    return `${encoded}.${sig}`;
}
function readStateJwt(state) {
    try {
        const [encoded, sig] = state.split(".");
        if (!encoded || !sig)
            return null;
        const expectedSig = crypto.createHmac("sha256", env.JWT_SECRET).update(encoded).digest("base64url");
        const sigOk = Buffer.byteLength(sig) === Buffer.byteLength(expectedSig) &&
            crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
        if (!sigOk)
            return null;
        const raw = Buffer.from(encoded, "base64url").toString("utf-8");
        const parsed = JSON.parse(raw);
        if (!parsed.nonce || !parsed.next || typeof parsed.exp !== "number")
            return null;
        if (Date.now() > parsed.exp)
            return null;
        return { nonce: parsed.nonce, next: parsed.next };
    }
    catch {
        return null;
    }
}
const registerSchema = z
    .object({
    pseudo: z.string().min(2).max(60),
    email: z.string().email(),
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
    language: z.string().length(2).default("fr")
})
    .refine((payload) => payload.password === payload.confirmPassword, {
    message: "Les mots de passe ne correspondent pas.",
    path: ["confirmPassword"]
});
const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8)
});
const verifyEmailSchema = z.object({
    userId: z.string().uuid(),
    code: z.string().length(6)
});
const verify2FASchema = z.object({
    userId: z.string().uuid(),
    code: z.string().length(6)
});
const resendCodeSchema = z.object({
    userId: z.string().uuid(),
    type: z.enum(["verification", "2fa"])
});
export async function register(req, res) {
    const payload = registerSchema.parse(req.body);
    const existing = await findUserByEmail(payload.email);
    if (existing) {
        res.status(409).json({ message: "Email déjà utilisé." });
        return;
    }
    const passwordHash = await hashPassword(payload.password);
    const user = await createUser({
        pseudo: payload.pseudo,
        email: payload.email,
        passwordHash,
        language: payload.language
    });
    // Vérifier si l'utilisateur fait partie des 100 premiers et attribuer le badge automatiquement
    try {
        const isAmongFirst100 = await isUserAmongFirst100(user.id);
        if (isAmongFirst100) {
            const badgeId = await getBadgeIdBySlug("100_premiers_utilisateurs");
            if (badgeId) {
                await assignBadgeToUser(user.id, badgeId);
            }
        }
    }
    catch (error) {
        // Ne pas bloquer l'inscription si l'attribution du badge échoue
        console.error("Erreur lors de l'attribution du badge '100 premiers utilisateurs':", error);
    }
    // Générer et envoyer le code de vérification
    const code = generateVerificationCode();
    await createVerificationCode(user.id, code);
    const emailTemplate = generateVerificationEmailTemplate(user.pseudo, code, user.language);
    emailTemplate.to = user.email;
    try {
        await sendEmail(emailTemplate);
        res.status(201).json({
            message: "Inscription réussie. Vérifiez votre email pour activer votre compte.",
            userId: user.id,
            requiresVerification: true
        });
    }
    catch (emailError) {
        console.error("Erreur lors de l'envoi de l'email de vérification:", emailError);
        res.status(201).json({
            message: "Inscription réussie, mais une erreur est survenue lors de l'envoi de l'email. Veuillez demander un nouveau code.",
            userId: user.id,
            requiresVerification: true,
            emailError: true
        });
    }
}
export async function login(req, res) {
    const payload = loginSchema.parse(req.body);
    const user = await findUserByEmail(payload.email);
    if (!user) {
        res.status(401).json({ message: "Identifiants invalides." });
        return;
    }
    const isValid = await comparePassword(payload.password, user.password_hash);
    if (!isValid) {
        res.status(401).json({ message: "Identifiants invalides." });
        return;
    }
    // Vérifier si la 2FA est activée
    const twoFactorActive = await isTwoFactorEnabled(user.id);
    if (twoFactorActive) {
        // Générer et envoyer le code 2FA
        const code = generateVerificationCode();
        await createTwoFactorCode(user.id, code);
        const emailTemplate = generate2FAEmailTemplate(user.pseudo, code, user.language);
        emailTemplate.to = user.email;
        try {
            await sendEmail(emailTemplate);
            res.json({
                message: "Code de vérification envoyé à votre email.",
                userId: user.id,
                requires2FA: true
            });
        }
        catch (emailError) {
            console.error("Erreur lors de l'envoi de l'email 2FA:", emailError);
            res.status(500).json({
                message: "Erreur lors de l'envoi du code de vérification. Veuillez réessayer.",
                error: process.env.NODE_ENV === 'development' ? emailError.message : undefined
            });
        }
    }
    else {
        // Connexion directe sans 2FA
        await updateLastLogin(user.id);
        const token = signAccessToken({
            sub: user.id,
            email: user.email,
            role: user.role
        });
        res.json({
            token,
            user: {
                id: user.id,
                pseudo: user.pseudo,
                email: user.email,
                avatar_url: user.avatar_url,
                email_verified: user.email_verified,
                two_factor_enabled: user.two_factor_enabled,
                role: user.role
            }
        });
    }
}
export async function verifyEmail(req, res) {
    const payload = verifyEmailSchema.parse(req.body);
    const verificationCode = await findVerificationCode(payload.userId, payload.code);
    if (!verificationCode) {
        res.status(400).json({ message: "Code invalide ou expiré." });
        return;
    }
    await markVerificationCodeAsUsed(verificationCode.id);
    await markEmailAsVerified(payload.userId);
    const user = await findUserByEmail((await findUserById(payload.userId)).email);
    if (!user) {
        res.status(404).json({ message: "Utilisateur introuvable." });
        return;
    }
    const token = signAccessToken({
        sub: user.id,
        email: user.email,
        role: user.role
    });
    res.json({
        message: "Email vérifié avec succès.",
        token,
        user: {
            id: user.id,
            pseudo: user.pseudo,
            email: user.email,
            avatar_url: user.avatar_url,
            email_verified: true,
            two_factor_enabled: user.two_factor_enabled,
            role: user.role
        }
    });
}
export async function verify2FA(req, res) {
    const payload = verify2FASchema.parse(req.body);
    const twoFactorCode = await findTwoFactorCode(payload.userId, payload.code);
    if (!twoFactorCode) {
        res.status(400).json({ message: "Code invalide ou expiré." });
        return;
    }
    await markTwoFactorCodeAsUsed(twoFactorCode.id);
    const user = await findUserByEmail((await findUserById(payload.userId)).email);
    if (!user) {
        res.status(404).json({ message: "Utilisateur introuvable." });
        return;
    }
    await updateLastLogin(user.id);
    const token = signAccessToken({
        sub: user.id,
        email: user.email,
        role: user.role
    });
    res.json({
        message: "Authentification réussie.",
        token,
        user: {
            id: user.id,
            pseudo: user.pseudo,
            email: user.email,
            avatar_url: user.avatar_url,
            email_verified: user.email_verified,
            two_factor_enabled: user.two_factor_enabled,
            role: user.role
        }
    });
}
export async function authentikAdminSsoLogin(req, res) {
    if (!env.AUTHENTIK_ISSUER || !env.AUTHENTIK_CLIENT_ID || !env.AUTHENTIK_CLIENT_SECRET || !env.AUTHENTIK_REDIRECT_URI) {
        res.status(501).json({ message: "SSO Authentik non configuré." });
        return;
    }
    const discovery = await getAuthentikDiscovery();
    const nonce = crypto.randomBytes(16).toString("hex");
    const next = typeof req.query.next === "string" ? req.query.next : "/admin";
    const state = buildStateJwt({ nonce, next });
    const authorizeUrl = new URL(discovery.authorization_endpoint);
    authorizeUrl.searchParams.set("client_id", env.AUTHENTIK_CLIENT_ID);
    authorizeUrl.searchParams.set("redirect_uri", env.AUTHENTIK_REDIRECT_URI);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("scope", "openid email profile");
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("nonce", nonce);
    res.redirect(authorizeUrl.toString());
}
export async function authentikAdminSsoCallback(req, res) {
    if (!env.AUTHENTIK_ISSUER || !env.AUTHENTIK_CLIENT_ID || !env.AUTHENTIK_CLIENT_SECRET || !env.AUTHENTIK_REDIRECT_URI) {
        res.status(501).json({ message: "SSO Authentik non configuré." });
        return;
    }
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;
    if (!code || !state) {
        res.status(400).json({ message: "Paramètres SSO manquants." });
        return;
    }
    const parsedState = readStateJwt(state);
    if (!parsedState) {
        res.status(400).json({ message: "State SSO invalide." });
        return;
    }
    const discovery = await getAuthentikDiscovery();
    const tokenResponse = await fetch(discovery.token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: env.AUTHENTIK_REDIRECT_URI,
            client_id: env.AUTHENTIK_CLIENT_ID,
            client_secret: env.AUTHENTIK_CLIENT_SECRET
        })
    });
    const tokenJson = (await tokenResponse.json().catch(() => ({})));
    if (!tokenResponse.ok || !tokenJson.access_token) {
        res.status(401).json({ message: "Échange du code SSO impossible." });
        return;
    }
    const userinfoResponse = await fetch(discovery.userinfo_endpoint, {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` }
    });
    const userinfo = (await userinfoResponse.json().catch(() => ({})));
    if (!userinfoResponse.ok || !userinfo.email) {
        res.status(401).json({ message: "Impossible de récupérer le profil SSO." });
        return;
    }
    const user = await findUserByEmail(userinfo.email);
    if (!user || user.role !== "admin") {
        res.status(403).json({ message: "Accès admin refusé." });
        return;
    }
    await updateLastLogin(user.id);
    const token = signAccessToken({ sub: user.id, email: user.email, role: user.role });
    const frontendBase = buildFrontendBaseUrl(req).replace(/\/$/, "");
    const next = parsedState.next.startsWith("/") ? parsedState.next : "/admin";
    const userPayload = {
        id: user.id,
        pseudo: user.pseudo,
        email: user.email,
        avatar_url: user.avatar_url,
        email_verified: user.email_verified,
        two_factor_enabled: user.two_factor_enabled,
        role: user.role
    };
    const userB64 = Buffer.from(JSON.stringify(userPayload), "utf-8").toString("base64");
    const redirectUrl = `${frontendBase}/sso/authentik#token=${encodeURIComponent(token)}&user=${encodeURIComponent(userB64)}&next=${encodeURIComponent(next)}`;
    res.redirect(redirectUrl);
}
export async function resendCode(req, res) {
    const payload = resendCodeSchema.parse(req.body);
    const user = await findUserById(payload.userId);
    if (!user) {
        res.status(404).json({ message: "Utilisateur introuvable." });
        return;
    }
    const code = generateVerificationCode();
    try {
        if (payload.type === "verification") {
            await createVerificationCode(user.id, code);
            const emailTemplate = generateVerificationEmailTemplate(user.pseudo, code, user.language);
            emailTemplate.to = user.email;
            await sendEmail(emailTemplate);
            res.json({ message: "Code de vérification renvoyé." });
        }
        else {
            await createTwoFactorCode(user.id, code);
            const emailTemplate = generate2FAEmailTemplate(user.pseudo, code, user.language);
            emailTemplate.to = user.email;
            await sendEmail(emailTemplate);
            res.json({ message: "Code 2FA renvoyé." });
        }
    }
    catch (error) {
        console.error(`Erreur lors du renvoi du code ${payload.type}:`, error);
        res.status(500).json({
            message: "Erreur lors de l'envoi de l'email. Veuillez réessayer.",
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}
