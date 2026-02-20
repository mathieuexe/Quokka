import { db } from "../config/db.js";
const PUBLIC_PATHS = new Set([
    "/api/health",
    "/api/maintenance",
    "/api/auth/login",
    "/api/auth/register",
    "/api/payments/webhook"
]);
export async function maintenanceGuard(req, res, next) {
    if (PUBLIC_PATHS.has(req.path)) {
        next();
        return;
    }
    const result = await db.query("SELECT is_enabled, message FROM maintenance_settings WHERE id = 1");
    const maintenance = result.rows[0];
    if (maintenance?.is_enabled) {
        res.status(503).json({
            message: maintenance.message,
            maintenance: true
        });
        return;
    }
    next();
}
