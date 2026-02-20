import { db } from "../config/db.js";
export async function listPromoCodes() {
    const result = await db.query(`
      SELECT
        id,
        code,
        is_active,
        discount_type,
        discount_value,
        user_id,
        server_id,
        max_uses,
        uses_count,
        expires_at,
        created_at
      FROM promo_codes
      ORDER BY created_at DESC
    `);
    return result.rows;
}
export async function listPromoCodesWithTargets() {
    const result = await db.query(`
      SELECT
        p.id,
        p.code,
        p.is_active,
        p.discount_type,
        p.discount_value,
        p.user_id,
        u.pseudo AS user_pseudo,
        p.server_id,
        s.name AS server_name,
        p.max_uses,
        p.uses_count,
        p.expires_at,
        p.created_at
      FROM promo_codes p
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN servers s ON s.id = p.server_id
      ORDER BY p.created_at DESC
    `);
    return result.rows;
}
export async function createPromoCode(input) {
    const result = await db.query(`
      INSERT INTO promo_codes (
        code,
        is_active,
        discount_type,
        discount_value,
        user_id,
        server_id,
        max_uses,
        expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING
        id,
        code,
        is_active,
        discount_type,
        discount_value,
        user_id,
        server_id,
        max_uses,
        uses_count,
        expires_at,
        created_at
    `, [
        input.code,
        input.isActive,
        input.discountType,
        input.discountValue,
        input.userId ?? null,
        input.serverId ?? null,
        input.maxUses ?? null,
        input.expiresAt ? input.expiresAt.toISOString() : null
    ]);
    return result.rows[0];
}
export async function findPromoCodeByCode(code) {
    const result = await db.query(`
      SELECT
        id,
        code,
        is_active,
        discount_type,
        discount_value,
        user_id,
        server_id,
        max_uses,
        uses_count,
        expires_at,
        created_at
      FROM promo_codes
      WHERE code = $1
      LIMIT 1
    `, [code]);
    return result.rows[0] ?? null;
}
export async function incrementPromoCodeUses(promoCodeId) {
    await db.query(`
      UPDATE promo_codes
      SET uses_count = uses_count + 1
      WHERE id = $1
    `, [promoCodeId]);
}
export async function setPromoCodeActive(promoCodeId, isActive) {
    await db.query(`
      UPDATE promo_codes
      SET is_active = $2
      WHERE id = $1
    `, [promoCodeId, isActive]);
}
