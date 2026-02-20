import type { Request, Response } from "express";
import { z } from "zod";
import {
  banUser,
  unbanUser,
  muteUser,
  unmuteUser,
  deleteUserChatMessages,
  warnUser,
  listUserWarnings,
  listUserBans,
  listUserMutes,
  listWarningsWithFilters,
  countWarningsWithFilters,
  getUserWarningCount,
  getUserModerationStatus,
  isUserBanned,
  isUserMuted
} from "../repositories/chatModerationRepository.js";
import { findUserById, findUserByPseudo } from "../repositories/userRepository.js";
import { createChatMessage } from "../repositories/chatRepository.js";

// Schémas de validation
const banSchema = z.object({
  userId: z.string().uuid("ID utilisateur invalide.").optional(),
  targetUser: z.string().optional(),
  reason: z.string().min(1, "Le motif est requis.").max(500, "Motif trop long."),
  durationHours: z.coerce.number().positive().optional()
}).refine(data => data.userId || data.targetUser, {
  message: "Vous devez spécifier un ID utilisateur ou un pseudo."
});

const unbanSchema = z.object({
  userId: z.string().uuid("ID utilisateur invalide.").optional(),
  targetUser: z.string().optional()
}).refine(data => data.userId || data.targetUser, {
  message: "Vous devez spécifier un ID utilisateur ou un pseudo."
});

const muteSchema = z.object({
  userId: z.string().uuid("ID utilisateur invalide.").optional(),
  targetUser: z.string().optional(),
  reason: z.string().min(1, "Le motif est requis.").max(500, "Motif trop long."),
  durationHours: z.coerce.number().positive().optional(),
  deleteMessages: z.boolean().default(true)
}).refine(data => data.userId || data.targetUser, {
  message: "Vous devez spécifier un ID utilisateur ou un pseudo."
});

const unmuteSchema = z.object({
  userId: z.string().uuid("ID utilisateur invalide.").optional(),
  targetUser: z.string().optional()
}).refine(data => data.userId || data.targetUser, {
  message: "Vous devez spécifier un ID utilisateur ou un pseudo."
});

const warnSchema = z.object({
  userId: z.string().uuid("ID utilisateur invalide.").optional(),
  targetUser: z.string().optional(),
  reason: z.string().min(1, "Le motif est requis.").max(500, "Motif trop long.")
}).refine(data => data.userId || data.targetUser, {
  message: "Vous devez spécifier un ID utilisateur ou un pseudo."
});

const warningsSchema = z.object({
  userId: z.string().uuid("ID utilisateur invalide.").optional(),
  targetUser: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional().default(50)
});

const warningsListSchema = z.object({
  userId: z.string().uuid("ID utilisateur invalide.").optional(),
  targetUser: z.string().optional(),
  status: z.enum(["all", "active", "inactive"]).optional().default("all"),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(200).optional().default(50),
  offset: z.coerce.number().int().min(0).optional().default(0)
});

const cassierSchema = z.object({
  limit: z.coerce.number().int().positive().max(200).optional().default(50)
});

/**
 * Commande /ban - Bannit un utilisateur temporairement ou définitivement
 */
export async function banUserHandler(req: Request, res: Response): Promise<void> {
  try {
    const payload = banSchema.parse(req.body);
    const adminUserId = req.user?.sub;
    
    if (!adminUserId) {
      res.status(401).json({ message: "Authentification requise." });
      return;
    }

    // Vérifier que l'utilisateur existe
    let targetUser = null;
    if (payload.userId) {
      targetUser = await findUserById(payload.userId);
    } else if (payload.targetUser) {
      targetUser = await findUserByPseudo(payload.targetUser);
    }

    if (!targetUser) {
      res.status(404).json({ message: "Utilisateur non trouvé." });
      return;
    }

    const targetUserId = targetUser.id;

    // Vérifier que l'utilisateur n'est pas déjà banni
    if (await isUserBanned(targetUserId)) {
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
    const ban = await banUser(targetUserId, adminUserId, payload.reason, payload.durationHours);

    // Créer un message système
    let durationText = "définitivement";
    if (ban.expires_at) {
      const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
      durationText = `jusqu'au ${dateFormatter.format(new Date(ban.expires_at))}`;
    }

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
  } catch (error) {
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
export async function unbanUserHandler(req: Request, res: Response): Promise<void> {
  try {
    const payload = unbanSchema.parse(req.body);
    const adminUserId = req.user?.sub;
    
    if (!adminUserId) {
      res.status(401).json({ message: "Authentification requise." });
      return;
    }

    // Vérifier que l'utilisateur existe
    let targetUser = null;
    if (payload.userId) {
      targetUser = await findUserById(payload.userId);
    } else if (payload.targetUser) {
      targetUser = await findUserByPseudo(payload.targetUser);
    }

    if (!targetUser) {
      res.status(404).json({ message: "Utilisateur non trouvé." });
      return;
    }

    const targetUserId = targetUser.id;

    // Débannir l'utilisateur
    const wasUnbanned = await unbanUser(targetUserId);
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
  } catch (error) {
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
export async function muteUserHandler(req: Request, res: Response): Promise<void> {
  try {
    const payload = muteSchema.parse(req.body);
    const adminUserId = req.user?.sub;
    
    if (!adminUserId) {
      res.status(401).json({ message: "Authentification requise." });
      return;
    }

    // Vérifier que l'utilisateur existe
    let targetUser = null;
    if (payload.userId) {
      targetUser = await findUserById(payload.userId);
    } else if (payload.targetUser) {
      targetUser = await findUserByPseudo(payload.targetUser);
    }

    if (!targetUser) {
      res.status(404).json({ message: "Utilisateur non trouvé." });
      return;
    }

    const targetUserId = targetUser.id;

    // Vérifier que l'utilisateur n'est pas déjà muet
    if (await isUserMuted(targetUserId)) {
      res.status(400).json({ message: "Cet utilisateur est déjà muet." });
      return;
    }

    // Créer le mute
    const mute = await muteUser(targetUserId, adminUserId, payload.reason, payload.durationHours);

    // Supprimer les messages si demandé
    let deletedMessages = 0;
    if (payload.deleteMessages) {
      deletedMessages = await deleteUserChatMessages(targetUserId);
    }

    // Obtenir les données de l'admin
    const adminUser = await findUserById(adminUserId);
    if (!adminUser) {
      res.status(404).json({ message: "Administrateur non trouvé." });
      return;
    }

    // Créer un message système
    let durationText = "définitivement";
    if (mute.expires_at) {
      const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
      durationText = `jusqu'au ${dateFormatter.format(new Date(mute.expires_at))}`;
    }

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
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: error.errors[0].message });
      return;
    }
    console.error("Erreur lors du mute:", error);
    res.status(500).json({ message: "Erreur serveur." });
  }
}

/**
 * Commande /unmute - Dé-mute un utilisateur
 */
export async function unmuteUserHandler(req: Request, res: Response): Promise<void> {
  try {
    const payload = unmuteSchema.parse(req.body);
    const adminUserId = req.user?.sub;
    
    if (!adminUserId) {
      res.status(401).json({ message: "Authentification requise." });
      return;
    }

    // Vérifier que l'utilisateur existe
    let targetUser = null;
    if (payload.userId) {
      targetUser = await findUserById(payload.userId);
    } else if (payload.targetUser) {
      targetUser = await findUserByPseudo(payload.targetUser);
    }

    if (!targetUser) {
      res.status(404).json({ message: "Utilisateur non trouvé." });
      return;
    }

    const targetUserId = targetUser.id;

    // Dé-mute l'utilisateur
    const wasUnmuted = await unmuteUser(targetUserId);
    if (!wasUnmuted) {
      res.status(400).json({ message: "Cet utilisateur n'est pas muet." });
      return;
    }

    // Obtenir les données de l'admin
    const adminUser = await findUserById(adminUserId);
    if (!adminUser) {
      res.status(404).json({ message: "Administrateur non trouvé." });
      return;
    }

    // Créer un message système
    const systemMessage = `🔊 ${targetUser.pseudo} a été dé-mute par ${adminUser.pseudo}.`;
    await createChatMessage(adminUserId, systemMessage);

    res.json({ message: "Utilisateur dé-mute avec succès." });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: error.errors[0].message });
      return;
    }
    console.error("Erreur lors du dé-mute:", error);
    res.status(500).json({ message: "Erreur serveur." });
  }
}

/**
 * Commande /warn - Avertit un utilisateur
 */
export async function warnUserHandler(req: Request, res: Response): Promise<void> {
  try {
    const payload = warnSchema.parse(req.body);
    const adminUserId = req.user?.sub;
    
    if (!adminUserId) {
      res.status(401).json({ message: "Authentification requise." });
      return;
    }

    // Vérifier que l'utilisateur existe
    let targetUser = null;
    if (payload.userId) {
      targetUser = await findUserById(payload.userId);
    } else if (payload.targetUser) {
      targetUser = await findUserByPseudo(payload.targetUser);
    }

    if (!targetUser) {
      res.status(404).json({ message: "Utilisateur non trouvé." });
      return;
    }

    const targetUserId = targetUser.id;

    // Obtenir les données de l'admin
    const adminUser = await findUserById(adminUserId);
    if (!adminUser) {
      res.status(404).json({ message: "Administrateur non trouvé." });
      return;
    }

    // Créer l'avertissement
    const warning = await warnUser(targetUserId, adminUserId, payload.reason);
    const warningCount = await getUserWarningCount(targetUserId);

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
  } catch (error) {
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
export async function getUserWarningsHandler(req: Request, res: Response): Promise<void> {
  try {
    const adminUserId = req.user?.sub;
    
    if (!adminUserId) {
      res.status(401).json({ message: "Authentification requise." });
      return;
    }

    const payload = warningsSchema.parse(req.method === 'POST' ? req.body : req.query);

    let targetUser = null;
    if (payload.userId) {
      targetUser = await findUserById(payload.userId);
    } else if (payload.targetUser) {
      targetUser = await findUserByPseudo(payload.targetUser);
    }

    if (!targetUser) {
      res.status(404).json({ message: "Utilisateur non trouvé." });
      return;
    }

    const targetUserId = targetUser.id;

    // Récupérer les avertissements
    const warnings = await listUserWarnings(targetUserId, payload.limit);
    const totalCount = await getUserWarningCount(targetUserId);

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
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: error.errors[0].message });
      return;
    }
    console.error("Erreur lors de la récupération des avertissements:", error);
    res.status(500).json({ message: "Erreur serveur." });
  }
}

export async function listAllWarningsHandler(req: Request, res: Response): Promise<void> {
  try {
    const adminUserId = req.user?.sub;
    if (!adminUserId) {
      res.status(401).json({ message: "Authentification requise." });
      return;
    }

    const payload = warningsListSchema.parse(req.query);
    const normalizedPseudo = payload.targetUser ? payload.targetUser.replace(/^@/, "") : undefined;

    let from = payload.from;
    let to = payload.to;
    let excludeRange = false;

    if (payload.status !== "all") {
      if (!from && !to) {
        const now = new Date();
        const fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        from = fromDate.toISOString();
        to = now.toISOString();
      }
      if (payload.status === "inactive") {
        excludeRange = true;
      }
    }

    const warnings = await listWarningsWithFilters({
      userId: payload.userId,
      targetPseudo: normalizedPseudo,
      from,
      to,
      excludeRange,
      limit: payload.limit,
      offset: payload.offset
    });

    const totalCount = await countWarningsWithFilters({
      userId: payload.userId,
      targetPseudo: normalizedPseudo,
      from,
      to,
      excludeRange
    });

    let activeFrom = from;
    let activeTo = to;
    if (!activeFrom && !activeTo) {
      const now = new Date();
      const fallbackFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      activeFrom = fallbackFrom.toISOString();
      activeTo = now.toISOString();
    }

    const activeFromMs = activeFrom ? new Date(activeFrom).getTime() : null;
    const activeToMs = activeTo ? new Date(activeTo).getTime() : null;

    res.json({
      warnings: warnings.map((warning) => {
        const createdAtMs = new Date(warning.created_at).getTime();
        const isActive =
          activeFromMs && activeToMs
            ? createdAtMs >= activeFromMs && createdAtMs <= activeToMs
            : activeFromMs
              ? createdAtMs >= activeFromMs
              : activeToMs
                ? createdAtMs <= activeToMs
                : true;
        return {
          id: warning.id,
          userId: warning.user_id,
          userPseudo: warning.user_pseudo,
          adminPseudo: warning.admin_pseudo,
          reason: warning.reason,
          createdAt: warning.created_at,
          isActive
        };
      }),
      totalCount
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: error.errors[0].message });
      return;
    }
    console.error("Erreur lors de la récupération des avertissements:", error);
    res.status(500).json({ message: "Erreur serveur." });
  }
}

export async function getUserCassierHandler(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) {
      res.status(401).json({ message: "Authentification requise." });
      return;
    }

    const payload = cassierSchema.parse(req.query);
    const [bans, mutes, warnings] = await Promise.all([
      listUserBans(userId, payload.limit),
      listUserMutes(userId, payload.limit),
      listUserWarnings(userId, payload.limit)
    ]);

    const nowMs = Date.now();
    const warningActiveAfter = nowMs - 30 * 24 * 60 * 60 * 1000;

    res.json({
      bans: bans.map((ban) => {
        const expiresAtMs = ban.expires_at ? new Date(ban.expires_at).getTime() : null;
        const isActive = ban.is_active && (!expiresAtMs || expiresAtMs > nowMs);
        return {
          id: ban.id,
          reason: ban.reason,
          expiresAt: ban.expires_at,
          createdAt: ban.created_at,
          isActive
        };
      }),
      mutes: mutes.map((mute) => {
        const expiresAtMs = mute.expires_at ? new Date(mute.expires_at).getTime() : null;
        const isActive = mute.is_active && (!expiresAtMs || expiresAtMs > nowMs);
        return {
          id: mute.id,
          reason: mute.reason,
          expiresAt: mute.expires_at,
          createdAt: mute.created_at,
          isActive
        };
      }),
      warnings: warnings.map((warning) => ({
        id: warning.id,
        reason: warning.reason,
        createdAt: warning.created_at,
        adminPseudo: warning.admin_pseudo,
        isActive: new Date(warning.created_at).getTime() >= warningActiveAfter
      }))
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ message: error.errors[0].message });
      return;
    }
    console.error("Erreur lors de la récupération du casier:", error);
    res.status(500).json({ message: "Erreur serveur." });
  }
}

/**
 * Obtient le statut de modération d'un utilisateur (pour debug/admin)
 */
export async function getUserModerationStatusHandler(req: Request, res: Response): Promise<void> {
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
  } catch (error) {
    console.error("Erreur lors de la récupération du statut de modération:", error);
    res.status(500).json({ message: "Erreur serveur." });
  }
}
