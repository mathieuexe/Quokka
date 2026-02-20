import { z } from "zod";
import { listServersByUser } from "../repositories/serverRepository.js";
import { listUserSubscriptions } from "../repositories/subscriptionRepository.js";
import { findUserById, listBadgesByUserId, updateProfile } from "../repositories/userRepository.js";
import { ensureMonthlyLikesReset } from "../repositories/voteRepository.js";
import { toggleTwoFactor } from "../repositories/verificationRepository.js";
const updateProfileSchema = z.object({
    pseudo: z.string().min(2).max(60),
    bio: z.string().max(500).default(""),
    avatarUrl: z.string().url().optional().or(z.literal("")),
    discordUrl: z.string().url().optional().or(z.literal("")),
    xUrl: z.string().url().optional().or(z.literal("")),
    blueskyUrl: z.string().url().optional().or(z.literal("")),
    stoatUrl: z.string().url().optional().or(z.literal("")),
    youtubeUrl: z.string().url().optional().or(z.literal("")),
    twitchUrl: z.string().url().optional().or(z.literal("")),
    kickUrl: z.string().url().optional().or(z.literal("")),
    snapchatUrl: z.string().url().optional().or(z.literal("")),
    tiktokUrl: z.string().url().optional().or(z.literal(""))
});
const toggle2FASchema = z.object({
    enabled: z.boolean()
});
function isImgurAvatarUrl(url) {
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        const isImgurHost = host === "imgur.com" || host.endsWith(".imgur.com");
        if (!isImgurHost)
            return false;
        const path = parsed.pathname.toLowerCase();
        return path.endsWith(".jpg") || path.endsWith(".jpeg") || path.endsWith(".png") || path.endsWith(".gif");
    }
    catch {
        return false;
    }
}
export async function getDashboard(req, res) {
    const userId = req.user?.sub;
    if (!userId) {
        res.status(401).json({ message: "Authentification requise." });
        return;
    }
    await ensureMonthlyLikesReset();
    const user = await findUserById(userId);
    if (!user) {
        res.status(404).json({ message: "Utilisateur introuvable." });
        return;
    }
    const [servers, subscriptions, badges] = await Promise.all([
        listServersByUser(userId),
        listUserSubscriptions(userId),
        listBadgesByUserId(userId)
    ]);
    res.json({
        user: {
            id: user.id,
            pseudo: user.pseudo,
            email: user.email,
            bio: user.bio,
            avatar_url: user.avatar_url,
            last_login_at: user.last_login_at,
            email_verified: user.email_verified,
            two_factor_enabled: user.two_factor_enabled,
            discord_url: user.discord_url,
            x_url: user.x_url,
            bluesky_url: user.bluesky_url,
            stoat_url: user.stoat_url,
            youtube_url: user.youtube_url,
            twitch_url: user.twitch_url,
            kick_url: user.kick_url,
            snapchat_url: user.snapchat_url,
            tiktok_url: user.tiktok_url,
            badges,
            role: user.role
        },
        servers,
        subscriptions
    });
}
export async function patchProfile(req, res) {
    const userId = req.user?.sub;
    if (!userId) {
        res.status(401).json({ message: "Authentification requise." });
        return;
    }
    const payload = updateProfileSchema.parse(req.body);
    if (payload.avatarUrl && !isImgurAvatarUrl(payload.avatarUrl)) {
        res.status(400).json({
            message: "L'avatar doit être hébergé sur Imgur et finir par .jpg, .jpeg, .png ou .gif."
        });
        return;
    }
    await updateProfile(userId, {
        pseudo: payload.pseudo,
        bio: payload.bio,
        avatarUrl: payload.avatarUrl || undefined,
        discordUrl: payload.discordUrl || undefined,
        xUrl: payload.xUrl || undefined,
        blueskyUrl: payload.blueskyUrl || undefined,
        stoatUrl: payload.stoatUrl || undefined,
        youtubeUrl: payload.youtubeUrl || undefined,
        twitchUrl: payload.twitchUrl || undefined,
        kickUrl: payload.kickUrl || undefined,
        snapchatUrl: payload.snapchatUrl || undefined,
        tiktokUrl: payload.tiktokUrl || undefined
    });
    res.json({ message: "Profil mis à jour." });
}
export async function toggle2FA(req, res) {
    const userId = req.user?.sub;
    if (!userId) {
        res.status(401).json({ message: "Authentification requise." });
        return;
    }
    const payload = toggle2FASchema.parse(req.body);
    await toggleTwoFactor(userId, payload.enabled);
    res.json({
        message: payload.enabled
            ? "Double authentification activée."
            : "Double authentification désactivée.",
        two_factor_enabled: payload.enabled
    });
}
