import { cleanupExpiredModerations } from "../repositories/chatModerationRepository.js";
/**
 * Service de nettoyage périodique pour les modérations expirées
 */
export class ModerationCleanupService {
    intervalId = null;
    isRunning = false;
    /**
     * Démarre le service de nettoyage
     * @param intervalMinutes - Intervalle en minutes entre chaque nettoyage (défaut: 60)
     */
    start(intervalMinutes = 60) {
        if (this.intervalId) {
            console.log("[ModerationCleanup] Service déjà démarré");
            return;
        }
        console.log(`[ModerationCleanup] Démarrage du service (intervalle: ${intervalMinutes} minutes)`);
        // Exécuter immédiatement une fois
        this.cleanupOnce();
        // Planifier les exécutions futures
        this.intervalId = setInterval(() => {
            this.cleanupOnce();
        }, intervalMinutes * 60 * 1000);
    }
    /**
     * Arrête le service de nettoyage
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            console.log("[ModerationCleanup] Service arrêté");
        }
    }
    /**
     * Effectue une passe de nettoyage unique
     */
    async cleanupOnce() {
        if (this.isRunning) {
            console.log("[ModerationCleanup] Nettoyage déjà en cours, annulation");
            return;
        }
        this.isRunning = true;
        const startTime = Date.now();
        try {
            console.log("[ModerationCleanup] Début du nettoyage des modérations expirées");
            const result = await cleanupExpiredModerations();
            const duration = Date.now() - startTime;
            console.log(`[ModerationCleanup] Nettoyage terminé en ${duration}ms - ${result.bans} bannissements et ${result.mutes} mutes expirés nettoyés`);
        }
        catch (error) {
            console.error("[ModerationCleanup] Erreur lors du nettoyage:", error);
        }
        finally {
            this.isRunning = false;
        }
    }
    /**
     * Vérifie si le service est en cours d'exécution
     */
    isStarted() {
        return this.intervalId !== null;
    }
}
// Instance singleton du service
export const moderationCleanupService = new ModerationCleanupService();
