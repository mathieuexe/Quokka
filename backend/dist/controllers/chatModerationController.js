import { z } from "zod";
import { banUser, unbanUser, muteUser, deleteUserChatMessages, warnUser, listUserWarnings, getUserWarningCount, getUserModerationStatus, isUserBanned, isUserMuted } from "../repositories/chatModerationRepository.js";
import { findUserById } from "../repositories/userRepository.js";
import { createChatMessage } from "../repositories/chatRepository.js";
// Schémas de validation
const banSchema = z.object({
    userId: z.string().uuid("ID utilisateur invalide."),
    reason: z.string().min(1, "Le motif est requis.").max(500, "Motif trop long."),
    durationHours: z.number().int().positive().optional()
});
const unbanSchema = z.object({
    userId: z.string().uuid("ID utilisateur invalide.")
});
const muteSchema = z.object({
    userId: z.string().uuid("ID utilisateur invalide."),
    reason: z.string().min(1, "Le motif est requis.").max(500, "Motif trop long."),
    durationHours: z.number().int().positive().optional(),
    deleteMessages: z.boolean().default(true)
});
const warnSchema = z.object({
    userId: z.string().uuid("ID utilisateur invalide."),
    reason: z.string().min(1, "Le motif est requis.").max(500, "Motif trop long.")
});
const warningsSchema = z.object({
    userId: z.string().uuid("ID utilisateur invalide."),
    limit: z.number().int().positive().max(100).optional().default(50)
});
/**
 * Commande /ban - Bannit un utilisateur temporairement ou définitivement
 */
export async function banUserHandler(req, res) {
    try {
        const payload = banSchema.parse(req.body);
        const adminUserId = req.user?.sub;
        if (!adminUserId) {
            res.status(401).json({ message: "Authentification requise." });
            return;
        }
        // Vérifier que l'utilisateur existe
        const targetUser = await findUserById(payload.userId);
        if (!targetUser) {
            res.status(404).json({ message: "Utilisateur non trouvé." });
            return;
        }
        // Vérifier que l'utilisateur n'est pas déjà banni
        if (await isUserBanned(payload.userId)) {
            res.status(400).json({ message: "Cet utilisateur est déjà banni." });
            return;
        }
        // Obtenir les données de l'admin
        const adminUser = await findUserById(adminUserId);
        if (!adminUser) {
            res.status(404).json({ message: "Administrateur non trouvé." });
            return;
        }
        // Créer le bannissement
        const ban = await banUser(payload.userId, adminUserId, payload.reason, payload.durationHours);
        // Créer un message système
        const durationText = payload.durationHours
            ? `pendant ${payload.durationHours} heure(s)`
            : "définitivement";
        const systemMessage = `🔨 ${targetUser.pseudo} a été banni ${durationText} par ${adminUser.pseudo}. Raison: ${payload.reason}`;
        await createChatMessage(adminUserId, systemMessage);
        res.json({
            message: `Utilisateur banni avec succès.`,
            ban: {
                id: ban.id,
                reason: ban.reason,
                expiresAt: ban.expires_at,
                createdAt: ban.created_at
            }
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: error.errors[0].message });
            return;
        }
        console.error("Erreur lors du bannissement:", error);
        res.status(500).json({ message: "Erreur serveur." });
    }
}
/**
 * Commande /unban - Débannit un utilisateur
 */
export async function unbanUserHandler(req, res) {
    try {
        const payload = unbanSchema.parse(req.body);
        const adminUserId = req.user?.sub;
        if (!adminUserId) {
            res.status(401).json({ message: "Authentification requise." });
            return;
        }
        // Vérifier que l'utilisateur existe
        const targetUser = await findUserById(payload.userId);
        if (!targetUser) {
            res.status(404).json({ message: "Utilisateur non trouvé." });
            return;
        }
        // Débannir l'utilisateur
        const wasUnbanned = await unbanUser(payload.userId);
        if (!wasUnbanned) {
            res.status(400).json({ message: "Cet utilisateur n'est pas banni." });
            return;
        }
        // Obtenir les données de l'admin
        const adminUser = await findUserById(adminUserId);
        if (!adminUser) {
            res.status(404).json({ message: "Administrateur non trouvé." });
            return;
        }
        // Créer un message système
        const systemMessage = `🔓 ${targetUser.pseudo} a été débanni par ${adminUser.pseudo}.`;
        await createChatMessage(adminUserId, systemMessage);
        res.json({ message: "Utilisateur débanni avec succès." });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: error.errors[0].message });
            return;
        }
        console.error("Erreur lors du débannissement:", error);
        res.status(500).json({ message: "Erreur serveur." });
    }
}
/**
 * Commande /mute - Rend muet un utilisateur
 */
export async function muteUserHandler(req, res) {
    try {
        const payload = muteSchema.parse(req.body);
        const adminUserId = req.user?.sub;
        if (!adminUserId) {
            res.status(401).json({ message: "Authentification requise." });
            return;
        }
        // Vérifier que l'utilisateur existe
        const targetUser = await findUserById(payload.userId);
        if (!targetUser) {
            res.status(404).json({ message: "Utilisateur non trouvé." });
            return;
        }
        // Vérifier que l'utilisateur n'est pas déjà muet
        if (await isUserMuted(payload.userId)) {
            res.status(400).json({ message: "Cet utilisateur est déjà muet." });
            return;
        }
        // Créer le mute
        const mute = await muteUser(payload.userId, adminUserId, payload.reason, payload.durationHours);
        // Supprimer les messages si demandé
        let deletedMessages = 0;
        if (payload.deleteMessages) {
            deletedMessages = await deleteUserChatMessages(payload.userId);
        }
        // Obtenir les données de l'admin
        const adminUser = await findUserById(adminUserId);
        if (!adminUser) {
            res.status(404).json({ message: "Administrateur non trouvé." });
            return;
        }
        // Créer un message système
        const durationText = payload.durationHours
            ? `pendant ${payload.durationHours} heure(s)`
            : "définitivement";
        const deleteText = payload.deleteMessages ? ` (${deletedMessages} messages supprimés)` : "";
        const systemMessage = `🔇 ${targetUser.pseudo} a été rendu muet ${durationText} par ${adminUser.pseudo}. Raison: ${payload.reason}${deleteText}`;
        await createChatMessage(adminUserId, systemMessage);
        res.json({
            message: `Utilisateur rendu muet avec succès.`,
            mute: {
                id: mute.id,
                reason: mute.reason,
                expiresAt: mute.expires_at,
                createdAt: mute.created_at,
                deletedMessages
            }
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: error.errors[0].message });
            return;
        }
        console.error("Erreur lors du mute:", error);
        res.status(500).json({ message: "Erreur serveur." });
    }
}
/**
 * Commande /warn - Avertit un utilisateur
 */
export async function warnUserHandler(req, res) {
    try {
        const payload = warnSchema.parse(req.body);
        const adminUserId = req.user?.sub;
        if (!adminUserId) {
            res.status(401).json({ message: "Authentification requise." });
            return;
        }
        // Vérifier que l'utilisateur existe
        const targetUser = await findUserById(payload.userId);
        if (!targetUser) {
            res.status(404).json({ message: "Utilisateur non trouvé." });
            return;
        }
        // Obtenir les données de l'admin
        const adminUser = await findUserById(adminUserId);
        if (!adminUser) {
            res.status(404).json({ message: "Administrateur non trouvé." });
            return;
        }
        // Créer l'avertissement
        const warning = await warnUser(payload.userId, adminUserId, payload.reason);
        const warningCount = await getUserWarningCount(payload.userId);
        // Créer un message système
        const systemMessage = `⚠️ ${targetUser.pseudo} a reçu un avertissement de ${adminUser.pseudo}. Raison: ${payload.reason} (${warningCount} avertissement${warningCount > 1 ? 's' : ''} au total)`;
        await createChatMessage(adminUserId, systemMessage);
        res.json({
            message: `Avertissement envoyé avec succès.`,
            warning: {
                id: warning.id,
                reason: warning.reason,
                createdAt: warning.created_at,
                adminPseudo: warning.admin_pseudo,
                totalWarnings: warningCount
            }
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: error.errors[0].message });
            return;
        }
        console.error("Erreur lors de l'avertissement:", error);
        res.status(500).json({ message: "Erreur serveur." });
    }
}
/**
 * Commande /warnings - Liste les avertissements d'un utilisateur
 */
export async function getUserWarningsHandler(req, res) {
    try {
        const query = warningsSchema.parse(req.query);
        const adminUserId = req.user?.sub;
        if (!adminUserId) {
            res.status(401).json({ message: "Authentification requise." });
            return;
        }
        // Vérifier que l'utilisateur existe
        const targetUser = await findUserById(query.userId);
        if (!targetUser) {
            res.status(404).json({ message: "Utilisateur non trouvé." });
            return;
        }
        // Récupérer les avertissements
        const warnings = await listUserWarnings(query.userId, query.limit);
        const totalCount = await getUserWarningCount(query.userId);
        res.json({
            user: {
                id: targetUser.id,
                pseudo: targetUser.pseudo,
                email: targetUser.email
            },
            warnings: warnings.map(w => ({
                id: w.id,
                reason: w.reason,
                createdAt: w.created_at,
                adminPseudo: w.admin_pseudo
            })),
            totalCount
        });
    }
    catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ message: error.errors[0].message });
            return;
        }
        console.error("Erreur lors de la récupération des avertissements:", error);
        res.status(500).json({ message: "Erreur serveur." });
    }
}
/**
 * Obtient le statut de modération d'un utilisateur (pour debug/admin)
 */
export async function getUserModerationStatusHandler(req, res) {
    try {
        const userId = req.params.userId;
        if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
            res.status(400).json({ message: "ID utilisateur invalide." });
            return;
        }
        const adminUserId = req.user?.sub;
        if (!adminUserId) {
            res.status(401).json({ message: "Authentification requise." });
            return;
        }
        // Vérifier que l'utilisateur existe
        const targetUser = await findUserById(userId);
        if (!targetUser) {
            res.status(404).json({ message: "Utilisateur non trouvé." });
            return;
        }
        const status = await getUserModerationStatus(userId);
        res.json({
            user: {
                id: targetUser.id,
                pseudo: targetUser.pseudo,
                email: targetUser.email
            },
            moderation: status
        });
    }
    catch (error) {
        console.error("Erreur lors de la récupération du statut de modération:", error);
        res.status(500).json({ message: "Erreur serveur." });
    }
}
