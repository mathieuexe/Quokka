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
  requires2FA?: boolean;
};

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const data = await apiRequest<AuthResponse>("/auth/login", {
        method: "POST",
        body: { email, password }
      });
      
      if (data.requires2FA && data.userId) {
        // Rediriger vers la page de vérification 2FA
        navigate(`/verify-2fa?userId=${data.userId}`);
      } else if (data.token && data.user) {
        // Connexion directe (si 2FA désactivé)
        login(data.token, data.user);
        navigate("/dashboard");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errors.invalidCredentials"));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="page auth-page">
      <div className="auth-shell">
        <article className="auth-panel">
          <span className="auth-kicker">Quokka</span>
          <h1>{t("auth.login")}</h1>
          <p className="auth-subtitle">{t("auth.loginSubtitle")}</p>
          <ul className="auth-feature-list">
            <li>{t("auth.loginFeature1")}</li>
            <li>{t("auth.loginFeature2")}</li>
            <li>{t("auth.loginFeature3")}</li>
          </ul>
        </article>

        <form className="card form auth-form-card" onSubmit={onSubmit}>
          <h2>{t("auth.loginButton")}</h2>
          <div className="auth-info-box">
            <p>
              L’inscription et la connexion via Discord ou Stoat seront bientôt disponibles et sont en cours de
              développement. Merci pour votre patience.
            </p>
          </div>
          <label>
            {t("auth.email")}
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            {t("auth.password")}
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button className="btn auth-submit-btn" type="submit" disabled={pending}>
            {pending ? t("common.loading") : t("auth.loginButton")}
          </button>
          <p className="auth-switch-link">
            {t("auth.noAccount")} <Link to="/register">{t("auth.register")}</Link>
          </p>
        </form>
      </div>
    </section>
  );
}
