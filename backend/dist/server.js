import { app } from "./app.js";
import { env } from "./config/env.js";
import { moderationCleanupService } from "./services/moderationCleanupService.js";
app.listen(env.PORT, () => {
    console.log(`Quokka API running on http://localhost:${env.PORT}`);
    // Démarrer le service de nettoyage des modérations
    moderationCleanupService.start(60); // Nettoyer toutes les heures
    console.log("🧹 Chat moderation cleanup service started");
});
