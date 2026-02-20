import { db } from "../config/db.js";

export type ChatBanRecord = {
  id: string;
  user_id: string;
  admin_user_id: string;
  reason: string;
  expires_at: string | null;
  created_at: string;
  is_active: boolean;
};

export type ChatMuteRecord = {
  id: string;
  user_id: string;
  admin_user_id: string;
  reason: string;
  expires_at: string | null;
  created_at: string;
  is_active: boolean;
};

export type ChatWarningRecord = {
  id: string;
  user_id: string;
  admin_user_id: string;
  reason: string;
  created_at: string;
  admin_pseudo: string;
};

export type ChatWarningListRecord = {
  id: string;
  user_id: string;
  admin_user_id: string;
  reason: string;
  created_at: string;
  user_pseudo: string;
  admin_pseudo: string;
};

type WarningFilters = {
  userId?: string;
  targetPseudo?: string;
  from?: string;
  to?: string;
  excludeRange?: boolean;
};

export type UserModerationStatus = {
  is_banned: boolean;
  ban_expires_at: string | null;
  ban_reason: string | null;
  is_muted: boolean;
  mute_expires_at: string | null;
  mute_reason: string | null;
  warning_count: number;
};

/**
 * Vérifie si un utilisateur est banni
 */
export async function isUserBanned(userId: string): Promise<ChatBanRecord | null> {
  const result = await db.query<ChatBanRecord>(
    `
      SELECT id, user_id, admin_user_id, reason, expires_at, created_at, is_active
      FROM active_chat_bans
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * Vérifie si un utilisateur est muet
 */
export async function isUserMuted(userId: string): Promise<ChatMuteRecord | null> {
  const result = await db.query<ChatMuteRecord>(
    `
      SELECT id, user_id, admin_user_id, reason, expires_at, created_at, is_active
      FROM active_chat_mutes
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * Obtient le statut de modération complet d'un utilisateur
 */
export async function getUserModerationStatus(userId: string): Promise<UserModerationStatus> {
  const result = await db.query<UserModerationStatus>(
    `
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
    `,
    [userId]
  );
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
export async function banUser(userId: string, adminUserId: string, reason: string, durationHours?: number): Promise<ChatBanRecord> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    
    // Désactiver les bannissements actifs existants
    await client.query(
      `UPDATE chat_bans SET is_active = FALSE WHERE user_id = $1 AND is_active = TRUE`,
      [userId]
    );
    
    // Créer le nouveau bannissement
    const expiresAt = durationHours ? new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString() : null;
    const result = await client.query<ChatBanRecord>(
      `
        INSERT INTO chat_bans (user_id, admin_user_id, reason, expires_at)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [userId, adminUserId, reason, expiresAt]
    );
    
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Débannit un utilisateur
 */
export async function unbanUser(userId: string): Promise<boolean> {
  const result = await db.query(
    `
      UPDATE chat_bans 
      SET is_active = FALSE 
      WHERE user_id = $1 AND is_active = TRUE
      RETURNING id
    `,
    [userId]
  );
  return result.rows.length > 0;
}

export async function listUserBans(userId: string, limit: number = 50): Promise<ChatBanRecord[]> {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const result = await db.query<ChatBanRecord>(
    `
      SELECT id, user_id, admin_user_id, reason, expires_at, created_at, is_active
      FROM chat_bans
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [userId, safeLimit]
  );
  return result.rows;
}

/**
 * Rend muet un utilisateur
 */
export async function muteUser(userId: string, adminUserId: string, reason: string, durationHours?: number): Promise<ChatMuteRecord> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    
    // Désactiver les mutes actifs existants
    await client.query(
      `UPDATE chat_mutes SET is_active = FALSE WHERE user_id = $1 AND is_active = TRUE`,
      [userId]
    );
    
    // Créer le nouveau mute
    const expiresAt = durationHours ? new Date(Date.now() + durationHours * 60 * 60 * 1000).toISOString() : null;
    const result = await client.query<ChatMuteRecord>(
      `
        INSERT INTO chat_mutes (user_id, admin_user_id, reason, expires_at)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [userId, adminUserId, reason, expiresAt]
    );
    
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Dé-mute un utilisateur
 */
export async function unmuteUser(userId: string): Promise<boolean> {
  const result = await db.query(
    `
      UPDATE chat_mutes 
      SET is_active = FALSE 
      WHERE user_id = $1 AND is_active = TRUE
      RETURNING id
    `,
    [userId]
  );
  return result.rows.length > 0;
}

export async function listUserMutes(userId: string, limit: number = 50): Promise<ChatMuteRecord[]> {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const result = await db.query<ChatMuteRecord>(
    `
      SELECT id, user_id, admin_user_id, reason, expires_at, created_at, is_active
      FROM chat_mutes
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `,
    [userId, safeLimit]
  );
  return result.rows;
}

/**
 * Supprime les messages d'un utilisateur muet (à appeler lors du mute)
 */
export async function deleteUserChatMessages(userId: string): Promise<number> {
  const result = await db.query(
    `
      DELETE FROM chat_messages 
      WHERE user_id = $1 AND message_type = 'user'
      RETURNING id
    `,
    [userId]
  );
  return result.rows.length;
}

/**
 * Avertit un utilisateur
 */
export async function warnUser(userId: string, adminUserId: string, reason: string): Promise<ChatWarningRecord> {
  const result = await db.query<ChatWarningRecord>(
    `
      INSERT INTO chat_warnings (user_id, admin_user_id, reason)
      VALUES ($1, $2, $3)
      RETURNING 
        chat_warnings.*,
        (SELECT pseudo FROM users WHERE id = $2) as admin_pseudo
    `,
    [userId, adminUserId, reason]
  );
  return result.rows[0];
}

/**
 * Liste les avertissements d'un utilisateur
 */
export async function listUserWarnings(userId: string, limit: number = 50): Promise<ChatWarningRecord[]> {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
  const result = await db.query<ChatWarningRecord>(
    `
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
    `,
    [userId, safeLimit]
  );
  return result.rows;
}

function buildWarningFilters(filters: WarningFilters): { clause: string; values: Array<string | number> } {
  const values: Array<string | number> = [];
  const clauses: string[] = [];

  if (filters.userId) {
    values.push(filters.userId);
    clauses.push(`w.user_id = $${values.length}`);
  }

  if (filters.targetPseudo) {
    values.push(filters.targetPseudo);
    clauses.push(`LOWER(target.pseudo) = LOWER($${values.length})`);
  }

  if (filters.from && filters.to) {
    values.push(filters.from);
    values.push(filters.to);
    clauses.push(
      filters.excludeRange
        ? `(w.created_at < $${values.length - 1} OR w.created_at > $${values.length})`
        : `w.created_at >= $${values.length - 1} AND w.created_at <= $${values.length}`
    );
  } else if (filters.from) {
    values.push(filters.from);
    clauses.push(filters.excludeRange ? `w.created_at < $${values.length}` : `w.created_at >= $${values.length}`);
  } else if (filters.to) {
    values.push(filters.to);
    clauses.push(filters.excludeRange ? `w.created_at > $${values.length}` : `w.created_at <= $${values.length}`);
  }

  return { clause: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", values };
}

export async function listWarningsWithFilters(
  filters: WarningFilters & { limit?: number; offset?: number }
): Promise<ChatWarningListRecord[]> {
  const safeLimit = Math.max(1, Math.min(200, Math.floor(filters.limit ?? 50)));
  const safeOffset = Math.max(0, Math.floor(filters.offset ?? 0));
  const { clause, values } = buildWarningFilters(filters);
  const limitIndex = values.length + 1;
  const offsetIndex = values.length + 2;

  const result = await db.query<ChatWarningListRecord>(
    `
      SELECT 
        w.id,
        w.user_id,
        w.admin_user_id,
        w.reason,
        w.created_at,
        target.pseudo as user_pseudo,
        admin.pseudo as admin_pseudo
      FROM chat_warnings w
      JOIN users target ON target.id = w.user_id
      JOIN users admin ON admin.id = w.admin_user_id
      ${clause}
      ORDER BY w.created_at DESC
      LIMIT $${limitIndex}
      OFFSET $${offsetIndex}
    `,
    [...values, safeLimit, safeOffset]
  );
  return result.rows;
}

export async function countWarningsWithFilters(filters: WarningFilters): Promise<number> {
  const { clause, values } = buildWarningFilters(filters);
  const result = await db.query(
    `
      SELECT COUNT(*) as count
      FROM chat_warnings w
      JOIN users target ON target.id = w.user_id
      JOIN users admin ON admin.id = w.admin_user_id
      ${clause}
    `,
    values
  );
  return parseInt(result.rows[0]?.count ?? "0");
}

/**
 * Obtient le nombre total d'avertissements d'un utilisateur
 */
export async function getUserWarningCount(userId: string): Promise<number> {
  const result = await db.query(
    `
      SELECT COUNT(*) as count
      FROM chat_warnings
      WHERE user_id = $1
    `,
    [userId]
  );
  return parseInt(result.rows[0]?.count ?? "0");
}

/**
 * Nettoie les bannissements et mutes expirés
 */
export async function cleanupExpiredModerations(): Promise<{ bans: number; mutes: number }> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    
    const bansResult = await client.query(
      `
        UPDATE chat_bans 
        SET is_active = FALSE 
        WHERE is_active = TRUE 
          AND expires_at IS NOT NULL 
          AND expires_at < NOW()
        RETURNING id
      `
    );
    
    const mutesResult = await client.query(
      `
        UPDATE chat_mutes 
        SET is_active = FALSE 
        WHERE is_active = TRUE 
          AND expires_at IS NOT NULL 
          AND expires_at < NOW()
        RETURNING id
      `
    );
    
    await client.query("COMMIT");
    return {
      bans: bansResult.rows.length,
      mutes: mutesResult.rows.length
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
