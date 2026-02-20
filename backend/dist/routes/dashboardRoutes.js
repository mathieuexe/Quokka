import { Router } from "express";
import { getDashboard, patchProfile, toggle2FA } from "../controllers/dashboardController.js";
import { requireAuth } from "../middleware/auth.js";
export const dashboardRoutes = Router();
dashboardRoutes.use(requireAuth);
dashboardRoutes.get("/", getDashboard);
dashboardRoutes.patch("/profile", patchProfile);
dashboardRoutes.post("/toggle-2fa", toggle2FA);
