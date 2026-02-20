import { z } from "zod";
import { getChatPresenceStatusForUser } from "../repositories/chatRepository.js";
import { listPublicServersByUser } from "../repositories/serverRepository.js";
import { findUserById, listBadgesByUserId } from "../repositories/userRepository.js";
export async function getPublicUserProfile(req, res) {
    const userId = z.string().uuid().parse(req.params.userId);
    const user = await findUserById(userId);
    if (!user) {
        res.status(404).json({ message: "Utilisateur introuvable." });
        return;
    }
    const [servers, badges] = await Promise.all([listPublicServersByUser(userId), listBadgesByUserId(userId)]);
    const presence = await getChatPresenceStatusForUser(userId);
    res.json({
        user: {
            id: user.id,
            pseudo: user.pseudo,
            chat_status: presence.status,
            bio: user.bio,
            avatar_url: user.avatar_url,
            created_at: user.created_at,
            last_login_at: user.last_login_at,
            discord_url: user.discord_url,
            x_url: user.x_url,
            bluesky_url: user.bluesky_url,
            stoat_url: user.stoat_url,
            youtube_url: user.youtube_url,
            twitch_url: user.twitch_url,
            kick_url: user.kick_url,
            snapchat_url: user.snapchat_url,
            tiktok_url: user.tiktok_url,
            badges
        },
        servers
    });
}
