import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { apiRequest } from "../lib/api";
import type { Badge, Server, User } from "../types";

type UserDetailsResponse = {
  user: User;
  servers: Server[];
  availableBadges: Badge[];
};

export function AdminUserDetailsPage(): JSX.Element {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { token, user: authUser } = useAuth();
  const { showToast } = useToast();
  const [details, setDetails] = useState<UserDetailsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formState, setFormState] = useState({
    pseudo: "",
    email: "",
    bio: "",
    internalNote: "",
    role: "user" as "user" | "admin"
  });
  const [selectedBadges, setSelectedBadges] = useState<string[]>([]);

  const loadDetails = useCallback(async (): Promise<void> => {
    if (!token || !userId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<UserDetailsResponse>(`/admin/users/${userId}`, { token });
      setDetails(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger cet utilisateur.");
    } finally {
      setLoading(false);
    }
  }, [token, userId]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  useEffect(() => {
    if (!details?.user) return;
    setFormState({
      pseudo: details.user.pseudo ?? "",
      email: details.user.email ?? "",
      bio: details.user.bio ?? "",
      internalNote: details.user.internal_note ?? "",
      role: details.user.role ?? "user"
    });
    setSelectedBadges(details.user.badges?.map((badge) => badge.id) ?? []);
  }, [details]);

  async function resendCode(type: "verification" | "2fa"): Promise<void> {
    if (!token || !userId) return;
    setSendingCode(true);
    try {
      await apiRequest<{ message: string }>("/admin/users/resend-code", {
        method: "POST",
        token,
        body: { userId, type }
      });
      showToast(type === "verification" ? "Code de vérification envoyé." : "Code 2FA envoyé.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Envoi du code impossible.");
    } finally {
      setSendingCode(false);
    }
  }

  async function deleteUser(): Promise<void> {
    if (!token || !details?.user) return;
    const target = details.user;
    const confirmation = window.prompt(
      `Suppression irréversible.\nTape "${target.pseudo}" pour confirmer la suppression de ce compte.`
    );
    if (confirmation !== target.pseudo) return;

    setDeleting(true);
    try {
      await apiRequest<{ message: string }>("/admin/users", {
        method: "DELETE",
        token,
        body: { userId: target.id }
      });
      showToast("Utilisateur supprimé.");
      navigate("/admin/users");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible.");
    } finally {
      setDeleting(false);
    }
  }

  async function updateUser(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!token || !details?.user) return;
    setSaving(true);
    setError(null);
    try {
      await apiRequest<{ message: string }>("/admin/users", {
        method: "PATCH",
        token,
        body: {
          userId: details.user.id,
          pseudo: formState.pseudo.trim(),
          email: formState.email.trim(),
          bio: formState.bio,
          internalNote: formState.internalNote,
          role: formState.role,
          badgeIds: selectedBadges
        }
      });
      showToast("Utilisateur mis à jour.");
      await loadDetails();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mise à jour impossible.");
    } finally {
      setSaving(false);
    }
  }

  function toggleBadge(badgeId: string): void {
    setSelectedBadges((current) =>
      current.includes(badgeId) ? current.filter((id) => id !== badgeId) : [...current, badgeId]
    );
  }

  if (loading) return <p>Chargement de la fiche utilisateur...</p>;
  if (!details) return <p className="error-text">{error ?? "Utilisateur introuvable."}</p>;

  const target = details.user;
  const createdAt = target.created_at ? new Date(target.created_at).toLocaleString("fr-FR") : "N/A";
  const availableBadges = details.availableBadges ?? [];

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h2>Fiche utilisateur</h2>
        <p>Vue dédiée avec toutes les informations du compte et la liste de ses serveurs.</p>
      </div>

      <article className="card admin-user-card">
        <div className="admin-user-header">
          <div>
            <h3>{target.pseudo}</h3>
            <p>{target.email}</p>
          </div>
          <div className="admin-user-meta">
            <span className="tag">Créé le : {createdAt}</span>
            <span className="tag">Rôle : {target.role}</span>
            <span className="tag">Langue : {(target.language ?? "fr").toUpperCase()}</span>
            {target.customer_reference && <span className="tag">Réf client : {target.customer_reference}</span>}
          </div>
        </div>

        <div className="admin-user-split">
          <div className="admin-user-section">
            <h4>Statut du compte</h4>
            <div className="admin-user-meta">
              <span className={`status-pill ${target.email_verified ? "status-paid" : "status-failed"}`}>
                {target.email_verified ? "Email vérifié" : "Email non vérifié"}
              </span>
              <span className={`status-pill ${target.two_factor_enabled ? "status-paid" : "status-pending"}`}>
                {target.two_factor_enabled ? "2FA activée" : "2FA désactivée"}
              </span>
            </div>
          </div>
          <div className="admin-user-section">
            <h4>Badges</h4>
            {!target.badges || target.badges.length === 0 ? (
              <p className="dashboard-muted">Aucun badge attribué.</p>
            ) : (
              <div className="user-badge-list">
                {target.badges.map((badge) => (
                  <span key={badge.id} className="tag tag-with-icon">
                    <img className="user-badge-icon" src={badge.image_url} alt={`Badge ${badge.label}`} loading="lazy" />
                    {badge.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="admin-user-split">
          <div className="admin-user-section">
            <h4>Bio</h4>
            {target.bio ? <p>{target.bio}</p> : <p className="dashboard-muted">Aucune bio renseignée.</p>}
          </div>
          <div className="admin-user-section">
            <h4>Note interne</h4>
            {target.internal_note ? <p>{target.internal_note}</p> : <p className="dashboard-muted">Aucune note interne.</p>}
          </div>
        </div>

        <div className="admin-user-section">
          <h4>Actions</h4>
          <div className="admin-user-actions">
            {!target.email_verified && (
              <button className="btn" type="button" disabled={sendingCode} onClick={() => void resendCode("verification")}>
                {sendingCode ? "Envoi..." : "Renvoyer le code email"}
              </button>
            )}
            <button className="btn btn-ghost" type="button" disabled={sendingCode} onClick={() => void resendCode("2fa")}>
              {sendingCode ? "Envoi..." : "Envoyer un code 2FA"}
            </button>
            {target.id !== authUser?.id && (
              <button className="btn btn-danger" type="button" disabled={deleting} onClick={() => void deleteUser()}>
                {deleting ? "Suppression..." : "Supprimer l'utilisateur"}
              </button>
            )}
          </div>
        </div>
      </article>

      <article className="card">
        <h3>Éditer l’utilisateur</h3>
        <form className="form" onSubmit={updateUser}>
          {error && <p className="error-text">{error}</p>}
          <label>
            Pseudo
            <input
              value={formState.pseudo}
              onChange={(event) => setFormState((prev) => ({ ...prev, pseudo: event.target.value }))}
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={formState.email}
              onChange={(event) => setFormState((prev) => ({ ...prev, email: event.target.value }))}
              required
            />
          </label>
          <label>
            Rôle
            <select value={formState.role} onChange={(event) => setFormState((prev) => ({ ...prev, role: event.target.value as "user" | "admin" }))}>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label>
            Bio
            <textarea
              rows={4}
              value={formState.bio}
              onChange={(event) => setFormState((prev) => ({ ...prev, bio: event.target.value }))}
            />
          </label>
          <label>
            Note interne
            <textarea
              rows={4}
              value={formState.internalNote}
              onChange={(event) => setFormState((prev) => ({ ...prev, internalNote: event.target.value }))}
            />
          </label>
          <div>
            <p className="admin-field-title">Badges</p>
            {availableBadges.length === 0 ? (
              <p>Aucun badge disponible.</p>
            ) : (
              <div className="admin-badge-grid">
                {availableBadges.map((badge) => (
                  <label key={badge.id} className="admin-badge-option">
                    <input
                      type="checkbox"
                      checked={selectedBadges.includes(badge.id)}
                      onChange={() => toggleBadge(badge.id)}
                    />
                    <img src={badge.image_url} alt={badge.label} loading="lazy" />
                    <span>{badge.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <button className="btn" type="submit" disabled={saving}>
            {saving ? "Mise à jour..." : "Enregistrer les changements"}
          </button>
        </form>
      </article>

      <article className="card">
        <h3>Serveurs de cet utilisateur</h3>
        {details.servers.length === 0 ? (
          <p>Aucun serveur enregistré.</p>
        ) : (
          <div className="admin-list-grid">
            {details.servers.map((server) => (
              <div key={server.id} className="admin-list-item static">
                <div>
                  <h3>{server.name}</h3>
                  <p>{server.category_label}</p>
                </div>
                <div className="admin-list-item-meta">
                  <span className="tag">Likes : {server.likes}</span>
                  <span className="tag">Vues : {server.views}</span>
                  <span className={`status-pill ${server.is_visible ? "status-paid" : "status-failed"}`}>
                    {server.is_visible ? "Visible" : "Masqué"}
                  </span>
                  <Link className="btn btn-ghost" to={`/servers/${server.id}`}>
                    Ouvrir la fiche serveur
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}
