/**
 * Utilitaires pour la modération du chat
 */
/**
 * Formate une durée en heures en texte lisible
 * @param hours - Nombre d'heures, ou null pour permanent
 * @returns Texte formaté (ex: "2 heures", "permanent")
 */
export function formatDuration(hours) {
    if (hours === null)
        return "permanent";
    if (hours === 1)
        return "1 heure";
    if (hours < 24)
        return `${hours} heures`;
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    if (remainingHours === 0) {
        return days === 1 ? "1 jour" : `${days} jours`;
    }
    return `${days} jour${days > 1 ? 's' : ''} et ${remainingHours} heure${remainingHours > 1 ? 's' : ''}`;
}
/**
 * Calcule le temps restant jusqu'à une date d'expiration
 * @param expiresAt - Date d'expiration ou null
 * @returns Texte formaté (ex: "2 heures restantes", "expiré")
 */
export function getTimeRemaining(expiresAt) {
    if (!expiresAt)
        return "permanent";
    const now = new Date();
    const expires = new Date(expiresAt);
    const diffMs = expires.getTime() - now.getTime();
    if (diffMs <= 0)
        return "expiré";
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (diffHours > 0) {
        return `${diffHours}h ${diffMinutes}m restantes`;
    }
    return `${diffMinutes} minutes restantes`;
}
/**
 * Nettoie les bannissements et mutes expirés
 * Cette fonction devrait être appelée périodiquement (ex: toutes les heures)
 */
export async function cleanupExpiredModerations() {
    try {
        const { cleanupExpiredModerations } = await import("../repositories/chatModerationRepository.js");
        return await cleanupExpiredModerations();
    }
    catch (error) {
        console.error("Erreur lors du nettoyage des modérations expirées:", error);
        return { bans: 0, mutes: 0 };
    }
}
/**
 * Crée un message système pour une action de modération
 */
export function createModerationMessage(action, targetUser, adminUser, reason, duration) {
    const durationText = duration !== undefined ? formatDuration(duration) : "";
    const reasonText = reason ? ` Raison: ${reason}` : "";
    switch (action) {
        case "ban":
            return `🔨 ${targetUser.pseudo} a été banni ${durationText} par ${adminUser.pseudo}.${reasonText}`;
        case "unban":
            return `🔓 ${targetUser.pseudo} a été débanni par ${adminUser.pseudo}.`;
        case "mute":
            return `🔇 ${targetUser.pseudo} a été rendu muet ${durationText} par ${adminUser.pseudo}.${reasonText}`;
        case "unmute":
            return `🔊 ${targetUser.pseudo} n'est plus muet.`;
        case "warn":
            return `⚠️ ${targetUser.pseudo} a reçu un avertissement de ${adminUser.pseudo}.${reasonText}`;
        default:
            return `Action de modération effectuée par ${adminUser.pseudo}.`;
    }
}
