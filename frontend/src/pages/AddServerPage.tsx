import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { apiRequest } from "../lib/api";
import type { Category } from "../types";

type CategoriesResponse = { categories: Category[] };
const COMMUNITY_SLUGS = new Set(["discord", "stoat"]);

const COUNTRIES = [
  { code: "FR", label: "France" },
  { code: "BE", label: "Belgique" },
  { code: "CH", label: "Suisse" },
  { code: "CA", label: "Canada" },
  { code: "US", label: "États-Unis" },
  { code: "DE", label: "Allemagne" }
];

export function AddServerPage(): JSX.Element {
  const { token, isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [bannerUrl, setBannerUrl] = useState("");
  const [countryCode, setCountryCode] = useState("FR");
  const [ip, setIp] = useState("");
  const [port, setPort] = useState(25565);
  const [isPublic, setIsPublic] = useState(true);
  const [inviteId, setInviteId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedCategory = useMemo(
    () => categories.find((cat) => cat.id === categoryId) ?? null,
    [categories, categoryId]
  );
  const gamingCategories = useMemo(
    () => categories.filter((cat) => !COMMUNITY_SLUGS.has(cat.slug)),
    [categories]
  );
  const communityCategories = useMemo(
    () => categories.filter((cat) => COMMUNITY_SLUGS.has(cat.slug)),
    [categories]
  );
  const isDiscord = selectedCategory?.slug === "discord";
  const isStoat = selectedCategory?.slug === "stoat";
  const isCommunity = isDiscord || isStoat;
  const inviteLinkPreview = isDiscord
    ? `https://discord.gg/${inviteId || "invite"}`
    : isStoat
      ? `https://stt.gg/${inviteId || "invite"}`
      : "";
  const connectionPreview = isCommunity ? inviteLinkPreview : ip ? `${ip}:${port || 25565}` : "IP:PORT";

  useEffect(() => {
    async function loadCategories(): Promise<void> {
      try {
        const data = await apiRequest<CategoriesResponse>("/servers/categories");
        setCategories(data.categories);
        if (data.categories.length) {
          const firstGaming = data.categories.find((cat) => !COMMUNITY_SLUGS.has(cat.slug));
          setCategoryId((firstGaming ?? data.categories[0]).id);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Impossible de charger les catégories.");
      }
    }
    void loadCategories();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!token) return;
    setError(null);
    try {
      const inviteLink = isDiscord
        ? `https://discord.gg/${inviteId}`
        : isStoat
          ? `https://stt.gg/${inviteId}`
          : undefined;

      await apiRequest<{ id: string }>("/servers", {
        method: "POST",
        token,
        body: {
          categoryId,
          name,
          website,
          description,
          bannerUrl,
          countryCode,
          ip: isCommunity ? undefined : ip,
          port: isCommunity ? undefined : Number(port),
          inviteLink,
          isPublic
        }
      });
      showToast("Serveur ajouté avec succès.");
      setInviteId("");
      setIp("");
      setDescription("");
      setBannerUrl("");
      setName("");
      setWebsite("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ajout serveur impossible.");
    }
  }

  if (!isAuthenticated) {
    return (
      <section className="page add-server-page">
        <div className="card add-server-auth">
          <h1>Ajouter un serveur</h1>
          <p>Connectez-vous pour publier votre serveur.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="page add-server-page">
      <div className="add-server-hero card">
        <div>
          <h1>Ajouter un serveur</h1>
          <p>Renseignez les informations essentielles pour apparaître dans l’annuaire.</p>
        </div>
        <ul className="add-server-steps">
          <li>Choisissez une catégorie</li>
          <li>Décrivez clairement votre serveur</li>
          <li>Ajoutez un lien ou une IP valide</li>
        </ul>
      </div>

      <div className="add-server-layout">
        <form className="card form add-server-form" onSubmit={onSubmit}>
          <div className="add-server-section">
            <div className="add-server-section-head">
              <h2>Informations</h2>
              <p>Les détails principaux visibles par les membres.</p>
            </div>
            <div className="add-server-grid">
              <label>
                Catégorie
                <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} required>
                  {gamingCategories.length > 0 && (
                    <optgroup label="Gaming">
                      {gamingCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {communityCategories.length > 0 && (
                    <optgroup label="Communauté">
                      {communityCategories.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </label>
              <label>
                Nom du serveur
                <input value={name} onChange={(event) => setName(event.target.value)} required />
              </label>
              <label>
                Site web
                <input type="url" value={website} onChange={(event) => setWebsite(event.target.value)} />
              </label>
              <label>
                Pays
                <select value={countryCode} onChange={(event) => setCountryCode(event.target.value)} required>
                  {COUNTRIES.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Description
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} required />
            </label>
          </div>

          <div className="add-server-section">
            <div className="add-server-section-head">
              <h2>Visuel</h2>
              <p>Ajoutez une bannière pour un rendu plus pro.</p>
            </div>
            <label>
              Banniere serveur (945x290)
              <input
                type="url"
                value={bannerUrl}
                onChange={(event) => setBannerUrl(event.target.value)}
                placeholder="https://i.imgur.com/..."
              />
            </label>
          </div>

          <div className="add-server-section">
            <div className="add-server-section-head">
              <h2>Connexion</h2>
              <p>Comment rejoindre votre serveur.</p>
            </div>
            {!isCommunity ? (
              <div className="add-server-grid">
                <label>
                  IP serveur
                  <input value={ip} onChange={(event) => setIp(event.target.value)} required />
                </label>
                <label>
                  Port
                  <input
                    type="number"
                    value={port}
                    onChange={(event) => setPort(Number(event.target.value))}
                    required
                  />
                </label>
                <label className="inline-control add-server-toggle">
                  <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
                  Serveur public
                </label>
              </div>
            ) : (
              <label>
                {isDiscord ? "ID invitation (discord.gg)" : "ID Stoat (stt.gg)"}
                <input value={inviteId} onChange={(event) => setInviteId(event.target.value)} required />
              </label>
            )}
          </div>

          {error && <p className="error-text">{error}</p>}
          <button className="btn add-server-submit" type="submit">
            Publier le serveur
          </button>
        </form>

        <aside className="add-server-side">
          <article className="card add-server-summary">
            <h2>Aperçu</h2>
            <div className="add-server-preview">
              <h3>{name || "Nom du serveur"}</h3>
              <p>{selectedCategory?.label || "Catégorie"}</p>
              <p>{countryCode}</p>
              {website && <a href={website} target="_blank" rel="noreferrer">{website}</a>}
              <div className="add-server-preview-row">
                <span>Connexion</span>
                <strong>{connectionPreview}</strong>
              </div>
            </div>
            {bannerUrl ? (
              <img className="add-server-banner" src={bannerUrl} alt="Banniere du serveur" loading="lazy" />
            ) : (
              <div className="add-server-banner-placeholder">Aperçu bannière</div>
            )}
          </article>

          <article className="card add-server-help">
            <h3>Conseils</h3>
            <ul>
              <li>Une description claire augmente les clics.</li>
              <li>Ajoutez une bannière cohérente avec votre thème.</li>
              <li>Vérifiez l’IP ou le lien d’invitation.</li>
            </ul>
          </article>
        </aside>
      </div>
    </section>
  );
}
