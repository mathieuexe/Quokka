import { db } from "../config/db.js";
export async function getChatSettings() {
    const result = await db.query(`
      SELECT maintenance_enabled, updated_at
      FROM chat_settings
      WHERE id = 1
    `);
    return result.rows[0] ?? { maintenance_enabled: false, updated_at: new Date().toISOString() };
}
export async function listRecentChatMessages(limit) {
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const result = await db.query(`
      SELECT *
      FROM (
        SELECT
          m.id,
          m.user_id,
          CASE WHEN m.message_type = 'system' THEN 'Système' ELSE u.pseudo END AS user_pseudo,
          CASE WHEN m.message_type = 'system' THEN NULL ELSE u.avatar_url END AS user_avatar_url,
          CASE WHEN m.message_type = 'system' THEN 'system' ELSE u.role END AS user_role,
          m.message_type,
          m.message,
          m.created_at
        FROM chat_messages m
        LEFT JOIN users u ON u.id = m.user_id
        ORDER BY m.created_at DESC
        LIMIT $1
      ) t
      ORDER BY created_at ASC
    `, [safeLimit]);
    return result.rows;
}
export async function listChatMessagesAfter(afterIso, limit) {
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const result = await db.query(`
      SELECT
        m.id,
        m.user_id,
        CASE WHEN m.message_type = 'system' THEN 'Système' ELSE u.pseudo END AS user_pseudo,
        CASE WHEN m.message_type = 'system' THEN NULL ELSE u.avatar_url END AS user_avatar_url,
        CASE WHEN m.message_type = 'system' THEN 'system' ELSE u.role END AS user_role,
        m.message_type,
        m.message,
        m.created_at
      FROM chat_messages m
      LEFT JOIN users u ON u.id = m.user_id
      WHERE m.created_at > $1::timestamptz
      ORDER BY m.created_at ASC
      LIMIT $2
    `, [afterIso, safeLimit]);
    return result.rows;
}
export async function createChatMessage(userId, message) {
    const result = await db.query(`
      WITH last_message AS (
        SELECT created_at
        FROM chat_messages
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      ),
      ins AS (
        INSERT INTO chat_messages (user_id, message)
        SELECT $1, $2
        WHERE NOT EXISTS (
          SELECT 1
          FROM last_message
          WHERE NOW() - created_at < INTERVAL '5 seconds'
        )
        RETURNING id, user_id, message, created_at, message_type
      )
      SELECT
        ins.id,
        ins.user_id,
        u.pseudo AS user_pseudo,
        u.avatar_url AS user_avatar_url,
        u.role AS user_role,
        ins.message_type,
        ins.message,
        ins.created_at
      FROM ins
      JOIN users u ON u.id = ins.user_id
    `, [userId, message]);
    return result.rows[0] ?? null;
}
export async function clearChatMessagesAndCreateSystemMessage(actorUserId) {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        await client.query("DELETE FROM chat_messages");
        const inserted = await client.query(`
        INSERT INTO chat_messages (user_id, message, message_type, system_actor_user_id)
        VALUES (NULL, $1, 'system', $2)
        RETURNING
          id,
          user_id,
          'Système' AS user_pseudo,
          NULL AS user_avatar_url,
          'system' AS user_role,
          message_type,
          message,
          created_at
      `, ["Le tchat a été effacé par un modérateur.", actorUserId]);
        await client.query("COMMIT");
        return inserted.rows[0];
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
}
export async function setChatMaintenanceEnabled(actorUserId, enabled) {
    const client = await db.connect();
    try {
        await client.query("BEGIN");
        await client.query(`
        UPDATE chat_settings
        SET maintenance_enabled = $1, updated_at = NOW()
        WHERE id = 1
      `, [enabled]);
        const inserted = await client.query(`
        INSERT INTO chat_messages (user_id, message, message_type, system_actor_user_id)
        VALUES (
          NULL,
          $1,
          'system',
          $2
        )
        RETURNING
          id,
          user_id,
          'Système' AS user_pseudo,
          NULL AS user_avatar_url,
          'system' AS user_role,
          message_type,
          message,
          created_at
      `, [enabled ? "Maintenance du tchat activée par un modérateur." : "Maintenance du tchat désactivée par un modérateur.", actorUserId]);
        await client.query("COMMIT");
        return inserted.rows[0];
    }
    catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
    finally {
        client.release();
    }
}
export async function upsertChatPresence(userId) {
    await db.query(`
      INSERT INTO chat_presence (user_id, last_seen_at)
      VALUES ($1, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET last_seen_at = NOW()
    `, [userId]);
}
export async function listOnlineChatUsers(windowSeconds, limit) {
    const safeWindowSeconds = Math.max(10, Math.min(10 * 60, Math.floor(windowSeconds)));
    const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)));
    const result = await db.query(`
      SELECT
        p.user_id,
        u.pseudo AS user_pseudo,
        u.avatar_url AS user_avatar_url,
        u.role AS user_role,
        p.last_seen_at
      FROM chat_presence p
      JOIN users u ON u.id = p.user_id
      WHERE p.last_seen_at > NOW() - make_interval(secs => $1)
      ORDER BY p.last_seen_at DESC
      LIMIT $2
    `, [safeWindowSeconds, safeLimit]);
    return result.rows;
}
export async function getChatPresenceStatusForUser(userId) {
    const result = await db.query(`
      SELECT
        CASE
          WHEN p.last_seen_at > NOW() - INTERVAL '5 minutes' THEN 'online'
          WHEN p.last_seen_at > NOW() - INTERVAL '30 minutes' THEN 'inactive'
          ELSE 'offline'
        END AS status,
        p.last_seen_at
      FROM chat_presence p
      WHERE p.user_id = $1
      LIMIT 1
    `, [userId]);
    return result.rows[0] ?? { status: "offline", last_seen_at: null };
}
export async function deleteChatPresence(userId) {
    await db.query(`
      DELETE FROM chat_presence
      WHERE user_id = $1
    `, [userId]);
}
export async function getChatMessageById(messageId) {
    const result = await db.query(`
      SELECT 
        m.id,
        m.user_id,
        m.message,
        m.message_type,
        m.created_at,
        u.pseudo AS user_pseudo,
        u.avatar_url AS user_avatar_url,
        u.role AS user_role
      FROM chat_messages m
      JOIN users u ON u.id = m.user_id
      WHERE m.id = $1
      LIMIT 1
    `, [messageId]);
    return result.rows[0] ?? null;
}
export async function deleteChatMessageById(messageId) {
    await db.query(`
      DELETE FROM chat_messages
      WHERE id = $1
    `, [messageId]);
}
export async function createSystemMessage(actorUserId, message) {
    const result = await db.query(`
      INSERT INTO chat_messages (user_id, message, message_type, created_at)
      VALUES ($1, $2, 'system', NOW())
      RETURNING 
        id,
        user_id,
        message,
        message_type,
        created_at,
        'Système' AS user_pseudo,
        NULL AS user_avatar_url,
        'system' AS user_role
    `, [actorUserId, message]);
    return result.rows[0];
}
