import { z } from "zod";
import { createServer, deleteServer, getServerById, getServerOwner, increaseView, listCategories, listServersByPriority, updateServer } from "../repositories/serverRepository.js";
import { ensureMonthlyLikesReset, VoteRuleError, voteForServer } from "../repositories/voteRepository.js";
import { verifyAccessToken } from "../utils/jwt.js";
const addServerSchema = z.object({
    categoryId: z.string().uuid(),
    name: z.string().min(2).max(120),
    description: z.string().min(10).max(5000),
    website: z.string().url().optional().or(z.literal("")),
    countryCode: z.string().length(2),
    ip: z.string().optional(),
    port: z.number().int().positive().optional(),
    inviteLink: z.string().url().optional(),
    bannerUrl: z.string().url().optional().or(z.literal("")),
    isPublic: z.boolean().default(true)
});
const updateServerSchema = z.object({
    categoryId: z.string().uuid().optional(),
    name: z.string().min(2).max(120),
    description: z.string().min(10).max(5000),
    website: z.string().url().optional().or(z.literal("")),
    countryCode: z.string().length(2),
    ip: z.string().optional(),
    port: z.number().int().positive().optional(),
    inviteLink: z.string().url().optional(),
    bannerUrl: z.string().url().optional().or(z.literal("")),
    isPublic: z.boolean().default(true)
});
function isImgurUrl(url) {
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.toLowerCase();
        return host === "imgur.com" || host.endsWith(".imgur.com");
    }
    catch {
        return false;
    }
}
export async function getHomeServers(req, res) {
    await ensureMonthlyLikesReset();
    const search = typeof req.query.search === "string" ? req.query.search : undefined;
    const servers = await listServersByPriority(search);
    res.json({ servers });
}
export async function getCategories(_req, res) {
    const categories = await listCategories();
    res.json({ categories });
}
export async function getServer(req, res) {
    await ensureMonthlyLikesReset();
    const serverId = z.string().uuid().parse(req.params.serverId);
    const server = await getServerById(serverId);
    if (!server) {
        res.status(404).json({ message: "Serveur introuvable." });
        return;
    }
    let userId;
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
        const token = header.slice("Bearer ".length);
        try {
            userId = verifyAccessToken(token).sub;
        }
        catch {
            userId = undefined;
        }
    }
    await increaseView(serverId, userId);
    res.json({ server });
}
export async function voteServer(req, res) {
    const userId = req.user?.sub;
    if (!userId) {
        res.status(401).json({ message: "Authentification requise." });
        return;
    }
    await ensureMonthlyLikesReset();
    const serverId = z.string().uuid().parse(req.params.serverId);
    try {
        const likes = await voteForServer(serverId, userId);
        res.json({ message: "Vote enregistré.", likes });
    }
    catch (error) {
        if (error instanceof VoteRuleError) {
            res.status(error.status).json({ message: error.message });
            return;
        }
        throw error;
    }
}
export async function addServer(req, res) {
    const userId = req.user?.sub;
    if (!userId) {
        res.status(401).json({ message: "Authentification requise." });
        return;
    }
    const payload = addServerSchema.parse(req.body);
    if (payload.bannerUrl && !isImgurUrl(payload.bannerUrl)) {
        res.status(400).json({ message: "La bannière doit être hébergée sur Imgur (imgur.com)." });
        return;
    }
    const isCommunity = payload.inviteLink && !payload.ip && !payload.port;
    const isGame = !payload.inviteLink && payload.ip && payload.port;
    if (!isCommunity && !isGame) {
        res.status(400).json({
            message: "Le serveur doit contenir soit inviteLink, soit ip+port."
        });
        return;
    }
    const server = await createServer({
        userId,
        categoryId: payload.categoryId,
        name: payload.name,
        description: payload.description,
        website: payload.website || undefined,
        countryCode: payload.countryCode.toUpperCase(),
        ip: payload.ip,
        port: payload.port,
        inviteLink: payload.inviteLink,
        bannerUrl: payload.bannerUrl || undefined,
        isPublic: payload.isPublic
    });
    res.status(201).json(server);
}
export async function patchServer(req, res) {
    const user = req.user;
    const serverId = z.string().uuid().parse(req.params.serverId);
    if (!user) {
        res.status(401).json({ message: "Authentification requise." });
        return;
    }
    const ownerId = await getServerOwner(serverId);
    if (!ownerId) {
        res.status(404).json({ message: "Serveur introuvable." });
        return;
    }
    if (ownerId !== user.sub && user.role !== "admin") {
        res.status(403).json({ message: "Accès refusé." });
        return;
    }
    const payload = updateServerSchema.parse(req.body);
    if (payload.bannerUrl && !isImgurUrl(payload.bannerUrl)) {
        res.status(400).json({ message: "La bannière doit être hébergée sur Imgur (imgur.com)." });
        return;
    }
    const isCommunity = payload.inviteLink && !payload.ip && !payload.port;
    const isGame = !payload.inviteLink && payload.ip && payload.port;
    if (!isCommunity && !isGame) {
        res.status(400).json({ message: "Le serveur doit contenir soit inviteLink, soit ip+port." });
        return;
    }
    await updateServer(serverId, {
        categoryId: payload.categoryId,
        name: payload.name,
        description: payload.description,
        website: payload.website || undefined,
        countryCode: payload.countryCode.toUpperCase(),
        ip: payload.ip,
        port: payload.port,
        inviteLink: payload.inviteLink,
        bannerUrl: payload.bannerUrl || undefined,
        isPublic: payload.isPublic
    });
    res.json({ message: "Serveur mis à jour." });
}
export async function removeServer(req, res) {
    const user = req.user;
    const serverId = z.string().uuid().parse(req.params.serverId);
    if (!user) {
        res.status(401).json({ message: "Authentification requise." });
        return;
    }
    const ownerId = await getServerOwner(serverId);
    if (!ownerId) {
        res.status(404).json({ message: "Serveur introuvable." });
        return;
    }
    if (ownerId !== user.sub && user.role !== "admin") {
        res.status(403).json({ message: "Accès refusé." });
        return;
    }
    await deleteServer(serverId);
    res.status(204).send();
}
