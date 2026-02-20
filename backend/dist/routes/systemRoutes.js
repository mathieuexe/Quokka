import { Router } from "express";
import { getMaintenance, health, setMaintenance } from "../controllers/systemController.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
export const systemRoutes = Router();
systemRoutes.get("/health", health);
systemRoutes.get("/maintenance", getMaintenance);
systemRoutes.patch("/maintenance", requireAuth, requireAdmin, setMaintenance);
