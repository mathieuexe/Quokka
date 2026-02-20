import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "react-i18next";
import { apiRequest } from "../lib/api";
import type { User } from "../types";

type AuthResponse = {
  token?: string;
  user?: User;
  message?: string;
  userId?: string;
  requiresVerification?: boolean;
};

export function RegisterPage(): JSX.Element {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t, i18n } = useTranslation();
  const [pseudo, setPseudo] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Détection automatique de la langue du navigateur
  const detectedLanguage = i18n.language.split("-")[0] || "fr";

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const data = await apiRequest<AuthResponse>("/auth/register", {
        method: "POST",
        body: { pseudo, email, password, confirmPassword, language: detectedLanguage }
      });
      
      if (data.requiresVerification && data.userId) {
        // Rediriger vers la page de vérification
        navigate(`/verify-email?userId=${data.userId}`);
      } else if (data.token && data.user) {
        // Connexion directe (ancienne méthode, au cas où)
        login(data.token, data.user);
        navigate("/dashboard");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.serverError"));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="page auth-page">
      <div className="auth-shell">
        <article className="auth-panel">
          <span className="auth-kicker">Quokka</span>
          <h1>{t("auth.register")}</h1>
          <p className="auth-subtitle">{t("auth.registerSubtitle")}</p>
          <ul className="auth-feature-list">
            <li>{t("auth.registerFeature1")}</li>
            <li>{t("auth.registerFeature2")}</li>
            <li>{t("auth.registerFeature3")}</li>
          </ul>
        </article>

        <form className="card form auth-form-card" onSubmit={onSubmit}>
          <h2>{t("auth.registerButton")}</h2>
          <div className="auth-info-box">
            <p>
              L’inscription et la connexion via Discord ou Stoat seront bientôt disponibles et sont en cours de
              développement. Merci pour votre patience.
            </p>
          </div>
          <label>
            {t("auth.username")}
            <input value={pseudo} onChange={(event) => setPseudo(event.target.value)} required />
          </label>
          <label>
            {t("auth.email")}
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            {t("auth.password")}
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          <label>
            {t("auth.confirmPassword")}
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button className="btn auth-submit-btn" type="submit" disabled={pending}>
            {pending ? t("common.loading") : t("auth.registerButton")}
          </button>
          <p className="auth-switch-link">
            {t("auth.hasAccount")} <Link to="/login">{t("auth.login")}</Link>
          </p>
        </form>
      </div>
    </section>
  );
}
