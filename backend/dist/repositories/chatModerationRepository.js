import { db } from "../config/db.js";
/**
 * Vérifie si un utilisateur est banni
 */
export async function isUserBanned(userId) {
    const result = await db.query(`
      SELECT id, user_id, admin_user_id, reason, expires_at, created_at, is_active
      FROM active_chat_bans
      WHERE user_id = $1
      LIMIT 1
    `, [userId]);
    return result.rows.length > 0;
}
/**
 * Vérifie si un utilisateur est muet
 */
export async function isUserMuted(userId) {
    const result = await db.query(`
      SELECT id, user_id, admin_user_id, reason, expires_at, created_at, is_active
      FROM active_chat_mutes
      WHERE user_id = $1
      LIMIT 1
    `, [userId]);
    return result.rows.length > 0;
}
/**
 * Obtient le statut de modération complet d'un utilisateur
 */
export async function getUserModerationStatus(userId) {
    const result = await db.query(`
      SELECT 
        CASE WHEN b.id IS NOT NULL THEN true ELSE false END as is_banned,
        b.expires_at as ban_expires_at,
        b.reason as ban_reason,
        CASE WHEN m.id IS NOT NULL THEN true ELSE false END as is_muted,
        m.expires_at as mute_expires_at,
        m.reason as mute_reason,
        COALESCE(w.warning_count, 0) as warning_count
      FROM users u
      LEFT JOIN active_chat_bans b ON b.user_id = u.id
      LEFT JOIN active_chat_mutes m ON m.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*) as warning_count
        FROM chat_warnings
        GROUP BY user_id
      ) w ON w.user_id = u.id
      WHERE u.id = $1
    `, [userId]);
    return result.rows[0] ?? {
        is_banned: false,
        ban_expires_at: null,
        ban_reason: null,
        is_muted: false,
        mute_expires_at: null,
        mute_reason: null,
        warning_count: 0
    };
}
/**
 * Bannit un utilisateur
 */
export async function banUser(userId, adminUserId, reason, durationHours) {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        // Désactiver les bannissements actifs existants
        await client.query(`UPDATE chat_bans SET is_active = FALSE WHERE user_id = $1 AND is_active = TRUE`, [userId]);
        // Créer le nouveau bannissement
        const expiresAt = durationHours ? new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString() : null;
        const result = await client.query(`
        INSERT INTO chat_bans (user_id, admin_user_id, reason, expires_at)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [userId, adminUserId, reason, expiresAt]);
        await client.query("COMMIT");
        return result.rows[0];
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
}
/**
 * Débannit un utilisateur
 */
export async function unbanUser(userId) {
    const result = await db.query(`
      UPDATE chat_bans 
      SET is_active = FALSE 
      WHERE user_id = $1 AND is_active = TRUE
      RETURNING id
    `, [userId]);
    return result.rows.length > 0;
}
/**
 * Rend muet un utilisateur
 */
export async function muteUser(userId, adminUserId, reason, durationHours) {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        // Désactiver les mutes actifs existants
        await client.query(`UPDATE chat_mutes SET is_active = FALSE WHERE user_id = $1 AND is_active = TRUE`, [userId]);
        // Créer le nouveau mute
        const expiresAt = durationHours ? new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString() : null;
        const result = await client.query(`
        INSERT INTO chat_mutes (user_id, admin_user_id, reason, expires_at)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [userId, adminUserId, reason, expiresAt]);
        await client.query("COMMIT");
        return result.rows[0];
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
}
/**
 * Supprime les messages d'un utilisateur muet (à appeler lors du mute)
 */
export async function deleteUserChatMessages(userId) {
    const result = await db.query(`
      DELETE FROM chat_messages 
      WHERE user_id = $1 AND message_type = 'user'
      RETURNING id
    `, [userId]);
    return result.rows.length;
}
/**
 * Avertit un utilisateur
 */
export async function warnUser(userId, adminUserId, reason) {
    const result = await db.query(`
      INSERT INTO chat_warnings (user_id, admin_user_id, reason)
      VALUES ($1, $2, $3)
      RETURNING 
        chat_warnings.*,
        (SELECT pseudo FROM users WHERE id = $2) as admin_pseudo
    `, [userId, adminUserId, reason]);
    return result.rows[0];
}
/**
 * Liste les avertissements d'un utilisateur
 */
export async function listUserWarnings(userId, limit = 50) {
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const result = await db.query(`
      SELECT 
        w.id,
        w.user_id,
        w.admin_user_id,
        w.reason,
        w.created_at,
        u.pseudo as admin_pseudo
      FROM chat_warnings w
      JOIN users u ON u.id = w.admin_user_id
      WHERE w.user_id = $1
      ORDER BY w.created_at DESC
      LIMIT $2
    `, [userId, safeLimit]);
    return result.rows;
}
/**
 * Obtient le nombre total d'avertissements d'un utilisateur
 */
export async function getUserWarningCount(userId) {
    const result = await db.query(`
      SELECT COUNT(*) as count
      FROM chat_warnings
      WHERE user_id = $1
    `, [userId]);
    return parseInt(result.rows[0]?.count ?? "0");
}
/**
 * Nettoie les bannissements et mutes expirés
 */
export async function cleanupExpiredModerations() {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        const bansResult = await client.query(`
        UPDATE chat_bans 
        SET is_active = FALSE 
        WHERE is_active = TRUE 
          AND expires_at IS NOT NULL 
          AND expires_at < NOW()
        RETURNING id
      `);
        const mutesResult = await client.query(`
        UPDATE chat_mutes 
        SET is_active = FALSE 
        WHERE is_active = TRUE 
          AND expires_at IS NOT NULL 
          AND expires_at < NOW()
        RETURNING id
      `);
        await client.query("COMMIT");
        return {
            bans: bansResult.rows.length,
            mutes: mutesResult.rows.length
        };
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
}
