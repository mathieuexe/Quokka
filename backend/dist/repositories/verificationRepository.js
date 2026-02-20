import { db } from "../config/db.js";
// ==================== VERIFICATION EMAIL ====================
export async function createVerificationCode(userId, code) {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const result = await db.query(`
      INSERT INTO email_verification_codes (user_id, code, expires_at)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [userId, code, expiresAt]);
    return result.rows[0];
}
export async function findVerificationCode(userId, code) {
    const result = await db.query(`
      SELECT * FROM email_verification_codes
      WHERE user_id = $1 AND code = $2 AND used = FALSE AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId, code]);
    return result.rows[0] ?? null;
}
export async function markVerificationCodeAsUsed(id) {
    await db.query(`
      UPDATE email_verification_codes
      SET used = TRUE
      WHERE id = $1
    `, [id]);
}
export async function deleteExpiredVerificationCodes() {
    await db.query(`
      DELETE FROM email_verification_codes
      WHERE expires_at < NOW()
    `);
}
export async function markEmailAsVerified(userId) {
    await db.query(`
      UPDATE users
      SET email_verified = TRUE, updated_at = NOW()
      WHERE id = $1
    `, [userId]);
}
// ==================== TWO FACTOR AUTHENTICATION ====================
export async function createTwoFactorCode(userId, code) {
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const result = await db.query(`
      INSERT INTO two_factor_codes (user_id, code, expires_at)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [userId, code, expiresAt]);
    return result.rows[0];
}
export async function findTwoFactorCode(userId, code) {
    const result = await db.query(`
      SELECT * FROM two_factor_codes
      WHERE user_id = $1 AND code = $2 AND used = FALSE AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
    `, [userId, code]);
    return result.rows[0] ?? null;
}
export async function markTwoFactorCodeAsUsed(id) {
    await db.query(`
      UPDATE two_factor_codes
      SET used = TRUE
      WHERE id = $1
    `, [id]);
}
export async function deleteTwoFactorCodesForUser(userId) {
    await db.query(`
      DELETE FROM two_factor_codes
      WHERE user_id = $1
    `, [userId]);
}
export async function deleteExpiredTwoFactorCodes() {
    await db.query(`
      DELETE FROM two_factor_codes
      WHERE expires_at < NOW()
    `);
}
export async function isTwoFactorEnabled(userId) {
    const result = await db.query(`
      SELECT two_factor_enabled FROM users WHERE id = $1
    `, [userId]);
    return result.rows[0]?.two_factor_enabled ?? true;
}
export async function toggleTwoFactor(userId, enabled) {
    await db.query(`
      UPDATE users
      SET two_factor_enabled = $2, updated_at = NOW()
      WHERE id = $1
    `, [userId, enabled]);
}
