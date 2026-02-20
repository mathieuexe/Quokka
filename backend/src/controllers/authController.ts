import type { Request, Response } from "express";
import { z } from "zod";
import { comparePassword, hashPassword } from "../utils/password.js";
import { createUser, findUserByEmail, findUserById, updateLastLogin, isUserAmongFirst100, getBadgeIdBySlug, assignBadgeToUser } from "../repositories/userRepository.js";
import { signAccessToken } from "../utils/jwt.js";
import {
  createVerificationCode,
  findVerificationCode,
  markVerificationCodeAsUsed,
  markEmailAsVerified,
  createTwoFactorCode,
  findTwoFactorCode,
  markTwoFactorCodeAsUsed,
  isTwoFactorEnabled
} from "../repositories/verificationRepository.js";
import {
  sendEmail,
  generateVerificationCode,
  generateVerificationEmailTemplate,
  generate2FAEmailTemplate
} from "../services/emailService.js";


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

export async function register(req: Request, res: Response): Promise<void> {
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
  } catch (error) {
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
  } catch (emailError) {
    console.error("Erreur lors de l'envoi de l'email de vérification:", emailError);
    res.status(201).json({
      message: "Inscription réussie, mais une erreur est survenue lors de l'envoi de l'email. Veuillez demander un nouveau code.",
      userId: user.id,
      requiresVerification: true,
      emailError: true
    });
  }
}

export async function login(req: Request, res: Response): Promise<void> {
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
    } catch (emailError) {
      console.error("Erreur lors de l'envoi de l'email 2FA:", emailError);
      res.status(500).json({
        message: "Erreur lors de l'envoi du code de vérification. Veuillez réessayer.",
        error: process.env.NODE_ENV === 'development' ? (emailError as Error).message : undefined
      });
    }
  } else {
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

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const payload = verifyEmailSchema.parse(req.body);

  const verificationCode = await findVerificationCode(payload.userId, payload.code);
  if (!verificationCode) {
    res.status(400).json({ message: "Code invalide ou expiré." });
    return;
  }

  await markVerificationCodeAsUsed(verificationCode.id);
  await markEmailAsVerified(payload.userId);

  const user = await findUserByEmail((await findUserById(payload.userId))!.email);
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

export async function verify2FA(req: Request, res: Response): Promise<void> {
  const payload = verify2FASchema.parse(req.body);

  const twoFactorCode = await findTwoFactorCode(payload.userId, payload.code);
  if (!twoFactorCode) {
    res.status(400).json({ message: "Code invalide ou expiré." });
    return;
  }

  await markTwoFactorCodeAsUsed(twoFactorCode.id);

  const user = await findUserByEmail((await findUserById(payload.userId))!.email);
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


export async function resendCode(req: Request, res: Response): Promise<void> {
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
    } else {
      await createTwoFactorCode(user.id, code);
      const emailTemplate = generate2FAEmailTemplate(user.pseudo, code, user.language);
      emailTemplate.to = user.email;
      await sendEmail(emailTemplate);
      res.json({ message: "Code 2FA renvoyé." });
    }
  } catch (error: any) {
    console.error(`Erreur lors du renvoi du code ${payload.type}:`, error);
    res.status(500).json({ 
      message: "Erreur lors de l'envoi de l'email. Veuillez réessayer.",
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
