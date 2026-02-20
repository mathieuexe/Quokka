import { db } from "../config/db.js";
const BASE_SERVER_QUERY = `
  WITH server_refs AS (
    SELECT
      s0.id,
      COALESCE((to_jsonb(s0)->>'reference_number')::int, ROW_NUMBER() OVER (ORDER BY s0.created_at ASC, s0.id ASC)) AS reference_number
    FROM servers s0
  )
  SELECT
    s.id,
    sr.reference_number,
    s.user_id,
    u.pseudo AS user_pseudo,
    u.avatar_url AS user_avatar_url,
    s.category_id,
    c.slug AS category_slug,
    c.label AS category_label,
    c.image_url AS category_image_url,
    s.name,
    s.description,
    s.website,
    s.country_code,
    s.ip,
    s.port,
    s.invite_link,
    s.banner_url,
    s.verified,
    s.is_public,
    s.is_hidden,
    s.is_visible,
    s.created_at,
    sub.type AS premium_type,
    sub.end_date AS premium_end_date,
    st.views,
    st.likes,
    st.visits,
    st.clicks
  FROM servers s
  JOIN server_refs sr ON sr.id = s.id
  JOIN users u ON u.id = s.user_id
  JOIN categories c ON c.id = s.category_id
  LEFT JOIN LATERAL (
    SELECT type, end_date
    FROM subscriptions
    WHERE server_id = s.id
      AND end_date > NOW()
    ORDER BY end_date DESC
    LIMIT 1
  ) sub ON true
  LEFT JOIN stats st ON st.server_id = s.id
`;
export async function listServersByPriority(search) {
    const params = [];
    const clauses = ["s.is_visible = true"];
    if (search?.trim()) {
        params.push(`%${search.trim()}%`);
        clauses.push(`s.name ILIKE $${params.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await db.query(`
      ${BASE_SERVER_QUERY}
      ${where}
      ORDER BY
        CASE
          WHEN sub.type = 'quokka_plus' THEN 1
          WHEN sub.type = 'essentiel' THEN 2
          ELSE 3
        END ASC,
        COALESCE(st.likes, 0) DESC,
        COALESCE(st.views, 0) DESC,
        COALESCE(st.visits, 0) DESC,
        s.created_at DESC
    `, params);
    return result.rows;
}
export async function listServersByUser(userId) {
    const result = await db.query(`
      ${BASE_SERVER_QUERY}
      WHERE s.user_id = $1
      ORDER BY s.created_at DESC
    `, [userId]);
    return result.rows;
}
export async function listPublicServersByUser(userId) {
    const result = await db.query(`
      ${BASE_SERVER_QUERY}
      WHERE s.user_id = $1
        AND s.is_public = true
        AND s.is_visible = true
      ORDER BY
        CASE
          WHEN sub.type = 'quokka_plus' THEN 1
          WHEN sub.type = 'essentiel' THEN 2
          ELSE 3
        END ASC,
        COALESCE(st.likes, 0) DESC,
        COALESCE(st.views, 0) DESC,
        COALESCE(st.visits, 0) DESC,
        s.created_at DESC
    `, [userId]);
    return result.rows;
}
export async function getServerById(id) {
    const result = await db.query(`
      ${BASE_SERVER_QUERY}
      WHERE s.id = $1
      LIMIT 1
    `, [id]);
    return result.rows[0] ?? null;
}
export async function createServer(input) {
    const result = await db.query(`
      INSERT INTO servers (
        user_id, category_id, name, description, website,
        country_code, ip, port, invite_link, banner_url, is_public
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id
    `, [
        input.userId,
        input.categoryId,
        input.name,
        input.description,
        input.website ?? null,
        input.countryCode,
        input.ip ?? null,
        input.port ?? null,
        input.inviteLink ?? null,
        input.bannerUrl ?? null,
        input.isPublic
    ]);
    const serverId = result.rows[0].id;
    await db.query("INSERT INTO stats (server_id) VALUES ($1) ON CONFLICT (server_id) DO NOTHING", [serverId]);
    return { id: serverId };
}
export async function listCategories() {
    const result = await db.query("SELECT id, slug, label, image_url FROM categories ORDER BY label ASC");
    return result.rows;
}
export async function increaseView(serverId, userId) {
    if (!userId) {
        await db.query(`
        UPDATE stats
        SET views = views + 1, updated_at = NOW()
        WHERE server_id = $1
      `, [serverId]);
        return;
    }
    const inserted = await db.query(`
      INSERT INTO server_views (server_id, user_id)
      VALUES ($1, $2)
      ON CONFLICT (server_id, user_id) DO NOTHING
      RETURNING id
    `, [serverId, userId]);
    if (!inserted.rows[0]) {
        return;
    }
    await db.query(`
      UPDATE stats
      SET views = views + 1, updated_at = NOW()
      WHERE server_id = $1
    `, [serverId]);
}
export async function setServerVisibility(serverId, isVisible) {
    await db.query("UPDATE servers SET is_visible = $2, updated_at = NOW() WHERE id = $1", [serverId, isVisible]);
}
export async function setServerHidden(serverId, isHidden) {
    await db.query("UPDATE servers SET is_hidden = $2, updated_at = NOW() WHERE id = $1", [serverId, isHidden]);
}
export async function getServerOwner(serverId) {
    const result = await db.query("SELECT user_id FROM servers WHERE id = $1 LIMIT 1", [serverId]);
    return result.rows[0]?.user_id ?? null;
}
export async function updateServer(serverId, input) {
    await db.query(`
      UPDATE servers
      SET name = $2,
          description = $3,
          website = $4,
          country_code = $5,
          ip = $6,
          port = $7,
          invite_link = $8,
          banner_url = $9,
          is_public = $10,
          category_id = COALESCE($11, category_id),
          updated_at = NOW()
      WHERE id = $1
    `, [
        serverId,
        input.name,
        input.description,
        input.website ?? null,
        input.countryCode,
        input.ip ?? null,
        input.port ?? null,
        input.inviteLink ?? null,
        input.bannerUrl ?? null,
        input.isPublic,
        input.categoryId ?? null
    ]);
}
export async function deleteServer(serverId) {
    await db.query("DELETE FROM servers WHERE id = $1", [serverId]);
}
export async function updateServerAsAdmin(serverId, input) {
    await db.query(`
      UPDATE servers
      SET category_id = $2,
          name = $3,
          description = $4,
          website = $5,
          country_code = $6,
          ip = $7,
          port = $8,
          invite_link = $9,
          banner_url = $10,
          is_public = $11,
          is_hidden = $12,
          is_visible = $13,
          verified = $14,
          updated_at = NOW()
      WHERE id = $1
    `, [
        serverId,
        input.categoryId,
        input.name,
        input.description,
        input.website ?? null,
        input.countryCode,
        input.ip ?? null,
        input.port ?? null,
        input.inviteLink ?? null,
        input.bannerUrl ?? null,
        input.isPublic,
        input.isHidden,
        input.isVisible,
        input.verified
    ]);
}
