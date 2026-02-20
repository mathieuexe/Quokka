import { db } from "../config/db.js";
const BADGE_DISPLAY_ORDER_SQL_WITH_ALIAS = `
  CASE b.slug
    WHEN 'fondateur' THEN 1
    WHEN 'moderateur_quokka' THEN 2
    WHEN 'developpeur_quokka' THEN 3
    WHEN 'soutien_financier_quokka' THEN 4
    WHEN '100_premiers_utilisateurs' THEN 5
    ELSE 999
  END
`;
const BADGE_DISPLAY_ORDER_SQL = `
  CASE slug
    WHEN 'fondateur' THEN 1
    WHEN 'moderateur_quokka' THEN 2
    WHEN 'developpeur_quokka' THEN 3
    WHEN 'soutien_financier_quokka' THEN 4
    WHEN '100_premiers_utilisateurs' THEN 5
    ELSE 999
  END
`;
export async function findUserByEmail(email) {
    const result = await db.query("SELECT * FROM users WHERE email = $1 LIMIT 1", [email]);
    return result.rows[0] ?? null;
}
export async function findUserById(id) {
    const result = await db.query("SELECT * FROM users WHERE id = $1 LIMIT 1", [id]);
    return result.rows[0] ?? null;
}
export async function createUser(params) {
    const result = await db.query(`
      INSERT INTO users (pseudo, email, password_hash, language)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [params.pseudo, params.email, params.passwordHash, params.language || "fr"]);
    return result.rows[0];
}
export async function updateProfile(userId, input) {
    await db.query(`
      UPDATE users
      SET pseudo = $2,
          bio = $3,
          language = COALESCE($4, language),
          avatar_url = $5,
          discord_url = $6,
          x_url = $7,
          bluesky_url = $8,
          stoat_url = $9,
          youtube_url = $10,
          twitch_url = $11,
          kick_url = $12,
          snapchat_url = $13,
          tiktok_url = $14,
          updated_at = NOW()
      WHERE id = $1
    `, [
        userId,
        input.pseudo,
        input.bio,
        input.language,
        input.avatarUrl ?? null,
        input.discordUrl ?? null,
        input.xUrl ?? null,
        input.blueskyUrl ?? null,
        input.stoatUrl ?? null,
        input.youtubeUrl ?? null,
        input.twitchUrl ?? null,
        input.kickUrl ?? null,
        input.snapchatUrl ?? null,
        input.tiktokUrl ?? null
    ]);
}
export async function listUsers() {
    const result = await db.query(`
      SELECT
        u.id,
        u.pseudo,
        u.email,
        u.bio,
        u.internal_note,
        u.avatar_url,
        u.role,
        u.created_at,
        u.email_verified,
        u.two_factor_enabled,
        u.language,
        COALESCE(
          json_agg(
            json_build_object(
              'id', b.id,
              'slug', b.slug,
              'label', b.label,
              'image_url', b.image_url
            )
            ORDER BY ${BADGE_DISPLAY_ORDER_SQL_WITH_ALIAS}, b.label ASC
          ) FILTER (WHERE b.id IS NOT NULL),
          '[]'::json
        ) AS badges
      FROM users u
      LEFT JOIN user_badges ub ON ub.user_id = u.id
      LEFT JOIN badges b ON b.id = ub.badge_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);
    return result.rows.map((row) => ({
        ...row,
        badges: Array.isArray(row.badges) ? row.badges : []
    }));
}
export async function updateLastLogin(userId) {
    await db.query("UPDATE users SET last_login_at = NOW(), updated_at = NOW() WHERE id = $1", [userId]);
}
export async function updateUserAsAdmin(userId, input) {
    await db.query(`
      UPDATE users
      SET pseudo = $2,
          email = $3,
          bio = $4,
          internal_note = $5,
          role = $6,
          updated_at = NOW()
      WHERE id = $1
    `, [userId, input.pseudo, input.email, input.bio, input.internalNote, input.role]);
}
export async function listAvailableBadges() {
    const result = await db.query(`
      SELECT id, slug, label, image_url
      FROM badges
      ORDER BY ${BADGE_DISPLAY_ORDER_SQL}, label ASC
    `);
    return result.rows;
}
export async function listBadgesByUserId(userId) {
    const result = await db.query(`
      SELECT b.id, b.slug, b.label, b.image_url
      FROM user_badges ub
      JOIN badges b ON b.id = ub.badge_id
      WHERE ub.user_id = $1
      ORDER BY ${BADGE_DISPLAY_ORDER_SQL_WITH_ALIAS}, b.label ASC
    `, [userId]);
    return result.rows;
}
export async function setUserBadgesAsAdmin(userId, badgeIds) {
    await db.query("BEGIN");
    try {
        await db.query("DELETE FROM user_badges WHERE user_id = $1", [userId]);
        if (badgeIds.length > 0) {
            await db.query(`
          INSERT INTO user_badges (user_id, badge_id)
          SELECT $1, b.id
          FROM badges b
          WHERE b.id = ANY($2::uuid[])
        `, [userId, badgeIds]);
        }
        await db.query("COMMIT");
    }
    catch (error) {
        await db.query("ROLLBACK");
        throw error;
    }
}
export async function deleteUser(userId) {
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
}
export async function isUserAmongFirst100(userId) {
    const result = await db.query(`
      SELECT COUNT(*) as rank
      FROM users
      WHERE created_at <= (SELECT created_at FROM users WHERE id = $1)
    `, [userId]);
    return (result.rows[0]?.rank ?? 0) <= 100;
}
export async function getBadgeIdBySlug(slug) {
    const result = await db.query("SELECT id FROM badges WHERE slug = $1 LIMIT 1", [slug]);
    return result.rows[0]?.id ?? null;
}
export async function assignBadgeToUser(userId, badgeId) {
    await db.query(`
      INSERT INTO user_badges (user_id, badge_id)
      VALUES ($1, $2)
      ON CONFLICT (user_id, badge_id) DO NOTHING
    `, [userId, badgeId]);
}
