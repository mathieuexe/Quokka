import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiRequest } from "../lib/api";
import type { Server, User } from "../types";

type ChatStatus = "online" | "inactive" | "offline";

type PublicUser = User & {
  chat_status: ChatStatus;
};

type PublicUserResponse = {
  user: PublicUser;
  servers: Server[];
};

type SocialItem = {
  label: string;
  url: string;
  icon: string;
};

function formatRelativeLastLogin(value: string): string {
  const lastLoginDate = new Date(value);
  const now = Date.now();
  const diffMs = now - lastLoginDate.getTime();

  if (!Number.isFinite(diffMs) || diffMs < 0) {
    return "il y a quelques instants";
  }

  const minutes = Math.floor(diffMs / (1000 * 60));
  if (minutes < 1) return "il y a quelques instants";
  if (minutes < 60) return `il y a ${minutes} minute${minutes > 1 ? "s" : ""}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours} heure${hours > 1 ? "s" : ""}`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `il y a ${days} jour${days > 1 ? "s" : ""}`;

  const months = Math.floor(days / 30);
  if (months < 12) return `il y a ${months} mois`;

  const years = Math.floor(days / 365);
  return `il y a ${years} an${years > 1 ? "s" : ""}`;
}

function formatChatStatusLabel(status: ChatStatus): string {
  if (status === "online") return "EN LIGNE";
  if (status === "inactive") return "INACTIF";
  return "HORS LIGNE";
}

export function UserProfilePage(): JSX.Element {
  const { userId } = useParams();
  const [data, setData] = useState<PublicUserResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadProfile(): Promise<void> {
      if (!userId) return;
      try {
        const result = await apiRequest<PublicUserResponse>(`/users/${userId}/profile`);
        setData(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Impossible de charger ce profil utilisateur.");
      }
    }

    void loadProfile();
  }, [userId]);

  const socials = useMemo<SocialItem[]>(() => {
    if (!data?.user) return [];
    return [
      { label: "Discord", url: data.user.discord_url ?? "", icon: "https://cdn.simpleicons.org/discord/5865F2" },
      { label: "X", url: data.user.x_url ?? "", icon: "https://cdn.simpleicons.org/x/000000" },
      { label: "Bluesky", url: data.user.bluesky_url ?? "", icon: "https://cdn.simpleicons.org/bluesky/1185FE" },
      {
        label: "Stoat",
        url: data.user.stoat_url ?? "",
        icon: "https://cdn.bsky.app/img/avatar/plain/did:plc:qyajbfzm2uhjni6gnkgboga2/bafkreiexpqtfjezmbnttj2xjwlb42tq2qgguqdbfagik7jowoavz4kdrz4@jpeg"
      },
      { label: "YouTube", url: data.user.youtube_url ?? "", icon: "https://cdn.simpleicons.org/youtube/FF0000" },
      { label: "Twitch", url: data.user.twitch_url ?? "", icon: "https://cdn.simpleicons.org/twitch/9146FF" },
      { label: "Kick", url: data.user.kick_url ?? "", icon: "https://cdn.simpleicons.org/kick/53FC18" },
      { label: "Snapchat", url: data.user.snapchat_url ?? "", icon: "https://cdn.simpleicons.org/snapchat/FFFC00" },
      { label: "TikTok", url: data.user.tiktok_url ?? "", icon: "https://cdn.simpleicons.org/tiktok/000000" }
    ].filter((item) => item.url.trim().length > 0);
  }, [data]);

  if (error) {
    return (
      <section className="page">
        <p className="error-text">{error}</p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="page">
        <p>Chargement du profil utilisateur...</p>
      </section>
    );
  }

  const createdAt = data.user.created_at ? new Date(data.user.created_at).toLocaleDateString("fr-FR") : "Inconnue";
  const lastLoginAt = data.user.last_login_at ? new Date(data.user.last_login_at).toLocaleString("fr-FR") : "Jamais connectée";
  const lastLoginRelative = data.user.last_login_at ? formatRelativeLastLogin(data.user.last_login_at) : null;

  return (
    <section className="page">
      <article className="card user-profile-card user-profile-hero-card">
        <div className="user-profile-hero">
          {data.user.avatar_url ? (
            <img className="avatar-128" src={data.user.avatar_url} alt={`Avatar de ${data.user.pseudo}`} />
          ) : (
            <div className="avatar-128 avatar-fallback">128x128</div>
          )}
          <div className="user-profile-main">
            <div className="user-profile-title-row">
              <h1>{data.user.pseudo}</h1>
              <span className={`user-profile-status is-${data.user.chat_status}`}>
                {formatChatStatusLabel(data.user.chat_status)}
              </span>
            </div>
            {!!data.user.badges?.length && (
              <div className="user-badge-list" aria-label="Badges du profil">
                {data.user.badges.map((badge) => (
                  <img
                    key={badge.id}
                    className="user-badge-icon"
                    src={badge.image_url}
                    alt={`Badge ${badge.label}`}
                    title={badge.label}
                    loading="lazy"
                  />
                ))}
              </div>
            )}
            {data.user.bio ? <p className="user-profile-bio">{data.user.bio}</p> : <p className="dashboard-muted">Aucune bio renseignée.</p>}
            <div className="user-profile-meta-grid">
              <div className="user-profile-meta-item">
                <span className="user-profile-meta-label">Inscription</span>
                <span>{createdAt}</span>
              </div>
              <div className="user-profile-meta-item">
                <span className="user-profile-meta-label">Dernière connexion</span>
                <span>
                  {lastLoginAt}
                  {lastLoginRelative ? ` (${lastLoginRelative})` : ""}
                </span>
              </div>
            </div>
          </div>
        </div>
      </article>

      <article className="card user-profile-card">
        <div className="user-profile-section-head">
          <h2>Réseaux sociaux</h2>
          <p className="dashboard-muted">Liens publics vers les réseaux de l’utilisateur.</p>
        </div>
        <div className="user-profile-section-body">
          {socials.length ? (
            <div className="user-social-grid">
              {socials.map((item) => (
                <a key={item.label} className="tag user-social-link" href={item.url} target="_blank" rel="noreferrer">
                  <img className="social-icon" src={item.icon} alt={`${item.label} icon`} loading="lazy" />
                  <span>{item.label}</span>
                </a>
              ))}
            </div>
          ) : (
            <p className="dashboard-muted">Aucun réseau social renseigné.</p>
          )}
        </div>
      </article>

      <article className="card user-profile-card">
        <div className="user-profile-section-head">
          <h2>Serveurs ({data.servers.length})</h2>
          <p className="dashboard-muted">Serveurs publics associés à ce profil.</p>
        </div>
        <div className="user-profile-section-body">
          {!data.servers.length ? (
            <p className="dashboard-muted">Aucun serveur public à afficher.</p>
          ) : (
            <div className="dashboard-server-grid user-profile-server-grid">
              {data.servers.map((server) => (
                <article key={server.id} className="card dashboard-server-card user-profile-server-card">
                  {server.banner_url && (
                    <img className="server-card-banner" src={server.banner_url} alt={`Banniere de ${server.name}`} loading="lazy" />
                  )}
                  <h3 className="server-title">
                    <span>{server.name}</span>
                    {server.verified && (
                      <img
                        className="verified-icon"
                        src="https://quokka.gg/images/icons/verified-icon.svg"
                        alt="Serveur vérifié"
                        title="Serveur vérifié"
                      />
                    )}
                  </h3>
                  <p className="server-description">{server.description}</p>
                  <div className="user-profile-server-meta">
                    <span className="tag">Catégorie : {server.category_label}</span>
                  </div>
                  <div className="server-card-actions user-profile-server-actions">
                    <Link className="btn btn-ghost" to={`/servers/${server.id}`}>
                      Voir la fiche serveur
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
