import Stripe from "stripe";
import { z } from "zod";
import { env } from "../config/env.js";
import { getServerOwner } from "../repositories/serverRepository.js";
import { createGiftedStripePayment, createPendingStripePayment, getUserStripePaymentById, getUserStripePaymentByCheckoutSessionId, listUserStripePayments, markStripePaymentCompleted, setStripePaymentPromotionWindow, upsertStripePaymentPromoMeta } from "../repositories/paymentRepository.js";
import { findPromoCodeByCode, incrementPromoCodeUses } from "../repositories/promoCodeRepository.js";
import { createSubscriptionRange } from "../repositories/subscriptionRepository.js";
import { findUserById } from "../repositories/userRepository.js";
import { generateInvoicePdf } from "../utils/invoicePdf.js";
import { generateCustomerReference } from "../utils/references.js";
const stripe = new Stripe(env.STRIPE_SECRET_KEY);
function resolveFrontendOrigin(req) {
    const origin = req.headers.origin;
    if (typeof origin === "string") {
        if (origin === env.CORS_ORIGIN)
            return origin;
        if (env.NODE_ENV !== "production" && (origin.startsWith("http://localhost") || origin.startsWith("http://127.0.0.1"))) {
            return origin;
        }
    }
    return env.CORS_ORIGIN;
}
function buildFrontendUrl(origin, path) {
    const base = origin.endsWith("/") ? origin.slice(0, -1) : origin;
    const resolvedPath = path.startsWith("/") ? path : `/${path}`;
    return `${base}${resolvedPath}`;
}
const createCheckoutSchema = z
    .object({
    serverId: z.string().uuid(),
    type: z.enum(["essentiel", "quokka_plus"]),
    days: z.number().int().min(1).max(30).optional(),
    hours: z.number().int().min(1).max(24).optional(),
    startDate: z.string().datetime().optional(),
    returnTo: z.enum(["dashboard", "offers"]).optional(),
    promoCode: z.string().trim().min(1).max(64).optional()
})
    .superRefine((payload, ctx) => {
    if (payload.type === "essentiel" && !payload.days) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Le nombre de jours est requis pour Essentiel.", path: ["days"] });
    }
    if (payload.type === "quokka_plus" && !payload.hours) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Le nombre d'heures est requis pour Quokka+.", path: ["hours"] });
    }
});
const promoPreviewSchema = z
    .object({
    serverId: z.string().uuid(),
    type: z.enum(["essentiel", "quokka_plus"]),
    days: z.number().int().min(1).max(30).optional(),
    hours: z.number().int().min(1).max(24).optional(),
    startDate: z.string().datetime().optional(),
    promoCode: z.string().trim().min(1).max(64)
})
    .superRefine((payload, ctx) => {
    if (payload.type === "essentiel" && !payload.days) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Le nombre de jours est requis pour Essentiel.", path: ["days"] });
    }
    if (payload.type === "quokka_plus" && !payload.hours) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Le nombre d'heures est requis pour Quokka+.", path: ["hours"] });
    }
});
function normalizePromoCode(value) {
    return value.trim().toUpperCase();
}
function computeDiscountedAmount(input) {
    if (input.promo.discount_type === "free")
        return 0;
    if (input.promo.discount_type === "percent") {
        const percent = Math.min(100, Math.max(0, input.promo.discount_value));
        return Math.max(0, Math.floor((input.baseAmountCents * (100 - percent)) / 100));
    }
    const fixed = Math.max(0, input.promo.discount_value);
    return Math.max(0, input.baseAmountCents - fixed);
}
async function validatePromoCodeForCheckout(input) {
    const promo = await findPromoCodeByCode(input.code);
    if (!promo || !promo.is_active) {
        return { ok: false, message: "Code promo invalide." };
    }
    if (promo.expires_at && new Date(promo.expires_at).getTime() <= Date.now()) {
        return { ok: false, message: "Ce code promo a expiré." };
    }
    if (promo.max_uses !== null && promo.uses_count >= promo.max_uses) {
        return { ok: false, message: "Ce code promo n'est plus disponible." };
    }
    if (promo.user_id && promo.user_id !== input.userId) {
        return { ok: false, message: "Ce code promo n'est pas disponible pour ce compte." };
    }
    if (promo.server_id && promo.server_id !== input.serverId) {
        return { ok: false, message: "Ce code promo ne s'applique pas à ce serveur." };
    }
    return { ok: true, promo };
}
export async function createCheckoutSession(req, res) {
    const userId = req.user?.sub;
    if (!userId) {
        res.status(401).json({ message: "Authentification requise." });
        return;
    }
    const payload = createCheckoutSchema.parse(req.body);
    const ownerId = await getServerOwner(payload.serverId);
    if (!ownerId) {
        res.status(404).json({ message: "Serveur introuvable." });
        return;
    }
    if (ownerId !== userId) {
        res.status(403).json({ message: "Paiement autorisé uniquement pour vos serveurs." });
        return;
    }
    const baseAmountCents = payload.type === "essentiel" ? (payload.days ?? 1) * 500 : (payload.hours ?? 1) * 100;
    const quantityLabel = payload.type === "essentiel" ? `${payload.days} jour(s)` : `${payload.hours} heure(s)`;
    const plannedStartDate = payload.type === "essentiel" && payload.startDate ? new Date(payload.startDate) : null;
    const returnTo = payload.returnTo ?? "offers";
    const frontendOrigin = resolveFrontendOrigin(req);
    const thankYouBaseUrl = buildFrontendUrl(frontendOrigin, "/order/thank-you");
    const cancelUrl = `${buildFrontendUrl(frontendOrigin, returnTo)}?payment=cancel`;
    const normalizedPromoCode = payload.promoCode ? normalizePromoCode(payload.promoCode) : null;
    const promoValidation = normalizedPromoCode
        ? await validatePromoCodeForCheckout({ code: normalizedPromoCode, userId, serverId: payload.serverId })
        : null;
    if (promoValidation && !promoValidation.ok) {
        res.status(400).json({ message: promoValidation.message });
        return;
    }
    const promo = promoValidation && promoValidation.ok ? promoValidation.promo : null;
    const amountCents = promo ? computeDiscountedAmount({ baseAmountCents, promo }) : baseAmountCents;
    if (amountCents === 0) {
        const startDate = payload.type === "essentiel" ? plannedStartDate ?? new Date() : new Date();
        const endDate = payload.type === "essentiel"
            ? new Date(startDate.getTime() + (payload.days ?? 1) * 24 * 60 * 60 * 1000)
            : new Date(startDate.getTime() + (payload.hours ?? 1) * 60 * 60 * 1000);
        const gifted = await createGiftedStripePayment({
            userId,
            serverId: payload.serverId,
            subscriptionType: payload.type,
            durationDays: payload.days ?? null,
            durationHours: payload.hours ?? null,
            promotionStartDate: startDate,
            promotionEndDate: endDate
        });
        await createSubscriptionRange({ serverId: payload.serverId, type: payload.type, startDate, endDate });
        await upsertStripePaymentPromoMeta({
            checkoutSessionId: gifted.checkoutSessionId,
            baseAmountCents,
            promoCode: promo ? promo.code : null,
            promoDiscountType: promo ? promo.discount_type : null,
            promoDiscountValue: promo ? promo.discount_value : null
        });
        if (promo) {
            await incrementPromoCodeUses(promo.id);
        }
        res.json({ checkoutUrl: `${thankYouBaseUrl}?session_id=${encodeURIComponent(gifted.checkoutSessionId)}` });
        return;
    }
    const successUrl = `${thankYouBaseUrl}?session_id={CHECKOUT_SESSION_ID}`;
    const session = await stripe.checkout.sessions.create({
        mode: "payment",
        success_url: successUrl,
        cancel_url: cancelUrl,
        line_items: [
            {
                quantity: 1,
                price_data: {
                    currency: "eur",
                    unit_amount: amountCents,
                    product_data: {
                        name: payload.type === "essentiel" ? "Abonnement Quokka Essentiel" : "Abonnement Quokka+",
                        description: `Promotion ${quantityLabel}`
                    }
                }
            }
        ],
        metadata: {
            serverId: payload.serverId,
            userId,
            type: payload.type,
            days: String(payload.days ?? ""),
            hours: String(payload.hours ?? ""),
            startDate: plannedStartDate ? plannedStartDate.toISOString() : "",
            returnTo,
            promoCodeId: promo ? promo.id : "",
            promoCode: promo ? promo.code : ""
        }
    });
    await createPendingStripePayment({
        checkoutSessionId: session.id,
        paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
        userId,
        serverId: payload.serverId,
        subscriptionType: payload.type,
        plannedStartDate,
        durationDays: payload.days ?? null,
        durationHours: payload.hours ?? null,
        amountCents
    });
    await upsertStripePaymentPromoMeta({
        checkoutSessionId: session.id,
        baseAmountCents,
        promoCode: promo ? promo.code : null,
        promoDiscountType: promo ? promo.discount_type : null,
        promoDiscountValue: promo ? promo.discount_value : null
    });
    res.json({ checkoutUrl: session.url });
}
export async function previewPromoCode(req, res) {
    const userId = req.user?.sub;
    if (!userId) {
        res.status(401).json({ message: "Authentification requise." });
        return;
    }
    const payload = promoPreviewSchema.parse(req.body);
    const ownerId = await getServerOwner(payload.serverId);
    if (!ownerId) {
        res.status(404).json({ message: "Serveur introuvable." });
        return;
    }
    if (ownerId !== userId) {
        res.status(403).json({ message: "Code promo autorisé uniquement pour vos serveurs." });
        return;
    }
    if (!payload.promoCode) {
        res.status(400).json({ message: "Code promo requis." });
        return;
    }
    const code = normalizePromoCode(payload.promoCode);
    const validation = await validatePromoCodeForCheckout({ code, userId, serverId: payload.serverId });
    if (!validation.ok) {
        res.status(400).json({ message: validation.message });
        return;
    }
    const baseAmountCents = payload.type === "essentiel" ? (payload.days ?? 1) * 500 : (payload.hours ?? 1) * 100;
    const finalAmountCents = computeDiscountedAmount({ baseAmountCents, promo: validation.promo });
    res.json({
        code: validation.promo.code,
        discount_type: validation.promo.discount_type,
        discount_value: validation.promo.discount_value,
        base_amount_cents: baseAmountCents,
        final_amount_cents: finalAmountCents
    });
}
export async function getCheckoutSessionSummary(req, res) {
    const userId = req.user?.sub;
    if (!userId) {
        res.status(401).json({ message: "Authentification requise." });
        return;
    }
    const checkoutSessionId = z.string().min(1).max(255).parse(req.params.checkoutSessionId);
    const payment = await getUserStripePaymentByCheckoutSessionId(checkoutSessionId, userId);
    if (!payment) {
        res.status(404).json({ message: "Commande introuvable." });
        return;
    }
    res.json({
        order_reference: payment.order_reference,
        checkout_session_id: payment.checkout_session_id,
        status: payment.status,
        subscription_type: payment.subscription_type,
        amount_cents: payment.amount_cents,
        server_id: payment.server_id,
        server_name: payment.server_name,
        created_at: payment.created_at,
        promo: payment.promo
    });
}
export async function stripeWebhook(req, res) {
    const signature = req.headers["stripe-signature"];
    if (!signature || typeof signature !== "string") {
        res.status(400).send("Missing stripe signature");
        return;
    }
    const event = stripe.webhooks.constructEvent(req.body, signature, env.STRIPE_WEBHOOK_SECRET);
    if (event.type === "checkout.session.completed") {
        const session = event.data.object;
        const payment = await markStripePaymentCompleted(session.id, typeof session.payment_intent === "string" ? session.payment_intent : null);
        if (payment) {
            const startDate = payment.type === "essentiel"
                ? payment.plannedStartDate ?? new Date()
                : new Date();
            const endDate = payment.type === "essentiel"
                ? new Date(startDate.getTime() + (payment.durationDays ?? 1) * 24 * 60 * 60 * 1000)
                : new Date(startDate.getTime() + (payment.durationHours ?? 1) * 60 * 60 * 1000);
            await createSubscriptionRange({ serverId: payment.serverId, type: payment.type, startDate, endDate });
            await setStripePaymentPromotionWindow({ checkoutSessionId: session.id, startDate, endDate });
            const promoCodeId = typeof session.metadata?.promoCodeId === "string" ? session.metadata.promoCodeId : "";
            if (promoCodeId) {
                await incrementPromoCodeUses(promoCodeId);
            }
        }
    }
    res.status(200).json({ received: true });
}
export async function getMyOrders(req, res) {
    const userId = req.user?.sub;
    if (!userId) {
        res.status(401).json({ message: "Authentification requise." });
        return;
    }
    const orders = await listUserStripePayments(userId);
    res.json({ orders });
}
export async function downloadInvoice(req, res) {
    const userId = req.user?.sub;
    if (!userId) {
        res.status(401).json({ message: "Authentification requise." });
        return;
    }
    const paymentId = z.string().uuid().parse(req.params.paymentId);
    const [payment, user] = await Promise.all([getUserStripePaymentById(paymentId, userId), findUserById(userId)]);
    if (!payment || !user) {
        res.status(404).json({ message: "Commande introuvable." });
        return;
    }
    const fallbackBaseAmountCents = payment.subscription_type === "essentiel"
        ? (payment.duration_days ?? 1) * 500
        : (payment.duration_hours ?? 1) * 100;
    const baseAmountCents = payment.promo?.base_amount_cents ?? fallbackBaseAmountCents;
    const promoCode = payment.promo?.promo_code ?? null;
    const promoLabel = payment.promo?.promo_discount_type === "free"
        ? "Gratuité"
        : payment.promo?.promo_discount_type === "percent" && payment.promo.promo_discount_value != null
            ? `-${payment.promo.promo_discount_value}%`
            : payment.promo?.promo_discount_type === "fixed" && payment.promo.promo_discount_value != null
                ? `-${(payment.promo.promo_discount_value / 100).toFixed(2)} EUR`
                : null;
    const pdf = await generateInvoicePdf({
        orderId: payment.order_reference,
        issueDate: new Date(),
        customerPseudo: user.pseudo,
        customerEmail: user.email,
        customerReference: generateCustomerReference(user.pseudo, user.id),
        serverName: payment.server_name,
        subscriptionLabel: payment.subscription_type === "essentiel" ? "Quokka Essentiel (par jour)" : "Quokka+ (par heure)",
        totalPaidQuantityLabel: payment.subscription_type === "essentiel"
            ? `${payment.duration_days ?? 1} jour(s)`
            : `${payment.duration_hours ?? 1} heure(s)`,
        promotionStartDate: payment.effective_start_date ? new Date(payment.effective_start_date) : null,
        promotionEndDate: payment.effective_end_date ? new Date(payment.effective_end_date) : null,
        baseAmountEuros: baseAmountCents / 100,
        amountEuros: payment.amount_cents / 100,
        promoCode,
        promoLabel,
        isOfferedByQuokka: payment.is_offered_by_quokka
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="facture-${payment.id}.pdf"`);
    res.send(pdf);
}
