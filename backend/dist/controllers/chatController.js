import { z } from "zod";
import { clearChatMessagesAndCreateSystemMessage, createChatMessage, createSystemMessage, deleteChatMessageById, deleteChatPresence, getChatMessageById, getChatSettings, listChatMessagesAfter, listOnlineChatUsers, listRecentChatMessages, setChatMaintenanceEnabled, upsertChatPresence } from "../repositories/chatRepository.js";
import { isUserBanned, isUserMuted } from "../repositories/chatModerationRepository.js";
const listSchema = z.object({
    after: z.string().optional(),
    limit: z.coerce.number().int().positive().max(200).optional()
});
const postSchema = z.object({
    message: z
        .string()
        .trim()
        .min(1, "Message vide.")
        .max(500, "Message trop long (500 caractères max).")
});
const onlineSchema = z.object({
    window: z.coerce.number().int().positive().max(600).optional(),
    limit: z.coerce.number().int().positive().max(200).optional()
});
const maintenanceSchema = z.object({
    enabled: z.boolean()
});
export async function getChatMessages(req, res) {
    const query = listSchema.parse(req.query);
    const limit = query.limit ?? 50;
    if (query.after) {
        const messages = await listChatMessagesAfter(query.after, limit);
        res.json({ messages });
        return;
    }
    const messages = await listRecentChatMessages(limit);
    res.json({ messages });
}
export async function postChatMessage(req, res) {
    const payload = postSchema.parse(req.body);
    const userId = req.user?.sub;
    if (!userId) {
        res.status(401).json({ message: "Authentification requise." });
        return;
    }
    // Vérifier si l'utilisateur est banni
    if (await isUserBanned(userId)) {
        res.status(403).json({ message: "Vous êtes banni du tchat." });
        return;
    }
    // Vérifier si l'utilisateur est muet
    if (await isUserMuted(userId)) {
        res.status(403).json({ message: "Vous êtes muet et ne pouvez pas envoyer de messages." });
        return;
    }
    const settings = await getChatSettings();
    if (settings.maintenance_enabled && req.user?.role !== "admin") {
        res.status(503).json({ message: "Maintenance du tchat en cours." });
        return;
    }
    const message = await createChatMessage(userId, payload.message);
    if (!message) {
        res.status(429).json({ message: "Anti-spam : veuillez attendre 5 secondes entre deux messages." });
        return;
    }
    res.status(201).json({ message });
}
export async function postChatPresence(req, res) {
    const userId = req.user?.sub;
    if (!userId) {
        res.status(401).json({ message: "Authentification requise." });
        return;
    }
    await upsertChatPresence(userId);
    res.status(204).send();
}
export async function deleteChatPresenceHandler(req, res) {
    const userId = req.user?.sub;
    if (!userId) {
        res.status(401).json({ message: "Authentification requise." });
        return;
    }
    await deleteChatPresence(userId);
    res.status(204).send();
}
export async function getChatOnlineUsers(req, res) {
    const query = onlineSchema.parse(req.query);
    const windowSeconds = query.window ?? 60;
    const limit = query.limit ?? 50;
    const users = await listOnlineChatUsers(windowSeconds, limit);
    res.json({ users });
}
export async function postChatClear(req, res) {
    const actorUserId = req.user?.sub;
    if (!actorUserId) {
        res.status(401).json({ message: "Authentification requise." });
        return;
    }
    const message = await clearChatMessagesAndCreateSystemMessage(actorUserId);
    res.json({ message });
}
export async function getChatStatus(req, res) {
    const settings = await getChatSettings();
    res.json({ maintenance_enabled: settings.maintenance_enabled, updated_at: settings.updated_at });
}
export async function postChatMaintenance(req, res) {
    const actorUserId = req.user?.sub;
    if (!actorUserId) {
        res.status(401).json({ message: "Authentification requise." });
        return;
    }
    const payload = maintenanceSchema.parse(req.body);
    const message = await setChatMaintenanceEnabled(actorUserId, payload.enabled);
    res.json({ message, maintenance_enabled: payload.enabled });
}
export async function deleteChatMessage(req, res) {
    const actorUserId = req.user?.sub;
    if (!actorUserId) {
        res.status(401).json({ message: "Authentification requise." });
        return;
    }
    const messageId = req.params.messageId;
    if (!messageId) {
        res.status(400).json({ message: "ID du message requis." });
        return;
    }
    try {
        // Check if the message exists
        const message = await getChatMessageById(messageId);
        if (!message) {
            res.status(404).json({ message: "Message non trouvé." });
            return;
        }
        // Delete the message
        await deleteChatMessageById(messageId);
        // Create a system message about the deletion
        const systemMessage = await createSystemMessage(actorUserId, `Un message a été supprimé par un administrateur.`);
        res.json({ message: systemMessage });
    }
    catch (error) {
        console.error("Erreur lors de la suppression du message:", error);
        res.status(500).json({ message: "Erreur interne du serveur." });
    }
}
