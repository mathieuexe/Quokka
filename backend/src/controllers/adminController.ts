import type { Request, Response } from "express";
import { z } from "zod";
import {
  listServersByPriority,
  listServersByUser,
  getServerOwner,
  setServerHidden,
  setServerVisibility,
  updateServerAsAdmin
} from "../repositories/serverRepository.js";
import { addSubscription, deleteSubscription, listAllSubscriptions } from "../repositories/subscriptionRepository.js";
import { listAvailableBadges, listUsers, setUserBadgesAsAdmin, updateUserAsAdmin, findUserById, deleteUser } from "../repositories/userRepository.js";
import { createGiftedStripePayment, listAllStripePayments } from "../repositories/paymentRepository.js";
import { createPromoCode, listPromoCodesWithTargets, setPromoCodeActive } from "../repositories/promoCodeRepository.js";
import { createVerificationCode, createTwoFactorCode } from "../repositories/verificationRepository.js";
import { sendEmail, generateVerificationCode, generateVerificationEmailTemplate, generate2FAEmailTemplate } from "../services/emailService.js";
import { generateCustomerReference } from "../utils/references.js";

const promoteSchema = z
  .object({
    serverId: z.string().uuid(),
    type: z.enum(["quokka_plus", "essentiel"]),
    durationDays: z.number().int().min(1).max(365).optional(),
    durationHours: z.number().int().min(1).max(24 * 365).optional(),
    premiumSlot: z.number().int().positive().optional()
  })
  .superRefine((payload, ctx) => {
    if (payload.type === "essentiel" && payload.durationDays === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La durée en jours est requise pour l'abonnement Essentiel.",
        path: ["durationDays"]
      });
    }
    if (payload.type === "quokka_plus" && payload.durationHours === undefined && payload.durationDays === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La durée en heures est requise pour l'abonnement Quokka+.",
        path: ["durationHours"]
      });
    }
  });

const serverStateSchema = z.object({
  serverId: z.string().uuid(),
  value: z.boolean()
});

const updateUserSchema = z.object({
  userId: z.string().uuid(),
  pseudo: z.string().min(2).max(60),
  email: z.string().email(),
  bio: z.string().max(1000).default(""),
  internalNote: z.string().max(5000).default(""),
  role: z.enum(["user", "admin"]),
  badgeIds: z.array(z.string().uuid()).optional()
});

const updateServerSchema = z.object({
  serverId: z.string().uuid(),
  categoryId: z.string().uuid(),
  name: z.string().min(2).max(120),
  description: z.string().min(10).max(4000),
  website: z.string().url().nullable().optional(),
  countryCode: z.string().length(2),
  ip: z.string().nullable().optional(),
  port: z.number().int().positive().max(65535).nullable().optional(),
  inviteLink: z.string().url().nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  isPublic: z.boolean(),
  isHidden: z.boolean(),
  isVisible: z.boolean(),
  verified: z.boolean()
});

const deleteSubscriptionSchema = z.object({
  subscriptionId: z.string().uuid()
});

const resendVerificationSchema = z.object({
  userId: z.string().uuid(),
  type: z.enum(["verification", "2fa"])
});

const deleteUserSchema = z.object({
  userId: z.string().uuid()
});

const createPromoCodeSchema = z
  .object({
    code: z.string().trim().min(3).max(64),
    scope: z.enum(["global", "user", "server", "user_server"]).default("global"),
    userId: z.string().uuid().optional(),
    serverId: z.string().uuid().optional(),
    type: z.enum(["fixed", "percent", "free"]),
    amountEuros: z.number().nonnegative().optional(),
    percent: z.number().int().min(1).max(100).optional(),
    maxUses: z.number().int().positive().optional(),
    expiresAt: z.string().datetime().optional(),
    isActive: z.boolean().default(true)
  })
  .superRefine((payload, ctx) => {
    if (payload.scope === "user" && !payload.userId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "userId requis pour un code utilisateur.", path: ["userId"] });
    }
    if (payload.scope === "server" && !payload.serverId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "serverId requis pour un code serveur.", path: ["serverId"] });
    }
    if (payload.scope === "user_server" && (!payload.userId || !payload.serverId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "userId et serverId requis.", path: ["scope"] });
    }
    if (payload.type === "fixed" && (payload.amountEuros === undefined || payload.amountEuros <= 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Montant en euros requis pour une réduction fixe.", path: ["amountEuros"] });
    }
    if (payload.type === "percent" && payload.percent === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Pourcentage requis pour une réduction en %.", path: ["percent"] });
    }
  });

const promoCodeActiveSchema = z.object({
  promoCodeId: z.string().uuid(),
  isActive: z.boolean()
});

const adminUserParamsSchema = z.object({
  userId: z.string().uuid()
});

export async function getAdminUsers(_req: Request, res: Response): Promise<void> {
  const [users, availableBadges] = await Promise.all([listUsers(), listAvailableBadges()]);
  const usersWithReference = users.map((user) => ({
    ...user,
    customer_reference: generateCustomerReference(user.pseudo, user.id)
  }));
  res.json({ users: usersWithReference, availableBadges });
}

export async function getAdminServers(req: Request, res: Response): Promise<void> {
  const search = typeof req.query.search === "string" ? req.query.search : undefined;
  const servers = await listServersByPriority(search);
  res.json({ servers });
}

export async function getAdminSubscriptions(_req: Request, res: Response): Promise<void> {
  const subscriptions = await listAllSubscriptions();
  res.json({ subscriptions });
}

export async function getAdminUserDetails(req: Request, res: Response): Promise<void> {
  const params = adminUserParamsSchema.parse(req.params);
  const [users, servers, availableBadges] = await Promise.all([
    listUsers(),
    listServersByUser(params.userId),
    listAvailableBadges()
  ]);
  const user = users.find((entry) => entry.id === params.userId);
  if (!user) {
    res.status(404).json({ message: "Utilisateur introuvable." });
    return;
  }
  res.json({
    user: {
      ...user,
      customer_reference: generateCustomerReference(user.pseudo, user.id)
    },
    servers,
    availableBadges
  });
}

export async function getAdminPromoCodes(_req: Request, res: Response): Promise<void> {
  const promoCodes = await listPromoCodesWithTargets();
  res.json({ promoCodes });
}

export async function postAdminPromoCode(req: Request, res: Response): Promise<void> {
  const payload = createPromoCodeSchema.parse(req.body);
  const normalizedCode = payload.code.trim().toUpperCase();
  const discountValue =
    payload.type === "fixed"
      ? Math.round((payload.amountEuros ?? 0) * 100)
      : payload.type === "percent"
        ? payload.percent ?? 0
        : 0;
  const userId = payload.scope === "user" || payload.scope === "user_server" ? payload.userId ?? null : null;
  const serverId = payload.scope === "server" || payload.scope === "user_server" ? payload.serverId ?? null : null;

  const promoCode = await createPromoCode({
    code: normalizedCode,
    isActive: payload.isActive,
    discountType: payload.type,
    discountValue,
    userId,
    serverId,
    maxUses: payload.maxUses ?? null,
    expiresAt: payload.expiresAt ? new Date(payload.expiresAt) : null
  });
  res.status(201).json({ promoCode });
}

export async function patchAdminPromoCodeActive(req: Request, res: Response): Promise<void> {
  const payload = promoCodeActiveSchema.parse(req.body);
  await setPromoCodeActive(payload.promoCodeId, payload.isActive);
  res.status(204).send();
}

export async function getAdminBilling(_req: Request, res: Response): Promise<void> {
  const [subscriptions, payments] = await Promise.all([listAllSubscriptions(), listAllStripePayments()]);
  const now = Date.now();

  const subscriptionsWithStatus = subscriptions.map((subscription) => {
    const lifecycleStatus = new Date(subscription.end_date).getTime() >= now ? "active" : "terminated";
    return {
      ...subscription,
      lifecycle_status: lifecycleStatus as "active" | "terminated"
    };
  });

  res.json({ subscriptions: subscriptionsWithStatus, payments });
}

export async function promoteServer(req: Request, res: Response): Promise<void> {
  const payload = promoteSchema.parse(req.body);
  const ownerId = await getServerOwner(payload.serverId);
  if (!ownerId) {
    res.status(404).json({ message: "Serveur introuvable." });
    return;
  }

  const promotion = await addSubscription(payload);
  await createGiftedStripePayment({
    userId: ownerId,
    serverId: payload.serverId,
    subscriptionType: payload.type,
    durationDays: payload.type === "essentiel" ? payload.durationDays ?? 1 : null,
    durationHours:
      payload.type === "quokka_plus"
        ? payload.durationHours ?? (payload.durationDays ? payload.durationDays * 24 : 1)
        : null,
    promotionStartDate: promotion.startDate,
    promotionEndDate: promotion.endDate
  });
  res.json({ message: "Serveur mis en avant avec succès." });
}

export async function hideServer(req: Request, res: Response): Promise<void> {
  const payload = serverStateSchema.parse(req.body);
  await setServerHidden(payload.serverId, payload.value);
  res.json({ message: "Masquage serveur mis à jour." });
}

export async function makeServerVisible(req: Request, res: Response): Promise<void> {
  const payload = serverStateSchema.parse(req.body);
  await setServerVisibility(payload.serverId, payload.value);
  res.json({ message: "Visibilité serveur mise à jour." });
}

export async function updateAdminUser(req: Request, res: Response): Promise<void> {
  const payload = updateUserSchema.parse(req.body);
  await updateUserAsAdmin(payload.userId, {
    pseudo: payload.pseudo,
    email: payload.email,
    bio: payload.bio,
    internalNote: payload.internalNote,
    role: payload.role
  });
  if (payload.badgeIds) {
    await setUserBadgesAsAdmin(payload.userId, payload.badgeIds);
  }
  res.json({ message: "Utilisateur mis à jour." });
}

export async function updateAdminServer(req: Request, res: Response): Promise<void> {
  const payload = updateServerSchema.parse(req.body);
  await updateServerAsAdmin(payload.serverId, {
    categoryId: payload.categoryId,
    name: payload.name,
    description: payload.description,
    website: payload.website ?? undefined,
    countryCode: payload.countryCode.toUpperCase(),
    ip: payload.ip ?? undefined,
    port: payload.port ?? undefined,
    inviteLink: payload.inviteLink ?? undefined,
    bannerUrl: payload.bannerUrl ?? undefined,
    isPublic: payload.isPublic,
    isHidden: payload.isHidden,
    isVisible: payload.isVisible,
    verified: payload.verified
  });
  res.json({ message: "Serveur mis à jour." });
}

export async function removeAdminSubscription(req: Request, res: Response): Promise<void> {
  const payload = deleteSubscriptionSchema.parse(req.body);
  await deleteSubscription(payload.subscriptionId);
  res.json({ message: "Abonnement supprimé." });
}

export async function resendVerificationCode(req: Request, res: Response): Promise<void> {
  const payload = resendVerificationSchema.parse(req.body);
  
  const user = await findUserById(payload.userId);
  if (!user) {
    res.status(404).json({ message: "Utilisateur introuvable." });
    return;
  }

  const code = generateVerificationCode();

  if (payload.type === "verification") {
    await createVerificationCode(user.id, code);
    const emailTemplate = generateVerificationEmailTemplate(user.pseudo, code, user.language);
    emailTemplate.to = user.email;
    await sendEmail(emailTemplate);
    res.json({ message: "Code de vérification envoyé." });
  } else {
    await createTwoFactorCode(user.id, code);
    const emailTemplate = generate2FAEmailTemplate(user.pseudo, code, user.language);
    emailTemplate.to = user.email;
    await sendEmail(emailTemplate);
    res.json({ message: "Code 2FA envoyé." });
  }
}

export async function removeAdminUser(req: Request, res: Response): Promise<void> {
  const payload = deleteUserSchema.parse(req.body);
  
  // Vérifier que l'utilisateur existe
  const user = await findUserById(payload.userId);
  if (!user) {
    res.status(404).json({ message: "Utilisateur introuvable." });
    return;
  }

  // Empêcher la suppression de son propre compte
  if (req.user?.sub === payload.userId) {
    res.status(400).json({ message: "Vous ne pouvez pas supprimer votre propre compte." });
    return;
  }

  await deleteUser(payload.userId);
  res.json({ message: "Utilisateur supprimé avec succès." });
}
