import { ZodError } from "zod";
export function notFound(_req, res) {
    res.status(404).json({ message: "Ressource introuvable." });
}
export function errorHandler(err, _req, res, _next) {
    if (err instanceof ZodError) {
        res.status(400).json({
            message: "Données invalides.",
            issues: err.issues
        });
        return;
    }
    console.error("[API ERROR]", err);
    res.status(500).json({ message: "Erreur interne serveur." });
}
