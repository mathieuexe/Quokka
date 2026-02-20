import { Router } from "express";
import { createCheckoutSession, downloadInvoice, getCheckoutSessionSummary, getMyOrders, previewPromoCode } from "../controllers/paymentController.js";
import { requireAuth } from "../middleware/auth.js";
export const paymentRoutes = Router();
paymentRoutes.post("/checkout-session", requireAuth, createCheckoutSession);
paymentRoutes.post("/promo/preview", requireAuth, previewPromoCode);
paymentRoutes.get("/checkout-session/:checkoutSessionId", requireAuth, getCheckoutSessionSummary);
paymentRoutes.get("/orders", requireAuth, getMyOrders);
paymentRoutes.get("/orders/:paymentId/invoice", requireAuth, downloadInvoice);
