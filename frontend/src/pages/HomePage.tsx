import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { apiRequest } from "../lib/api";
import type { Server } from "../types";
import { ServerCard } from "../components/ServerCard";

type HomeResponse = { servers: Server[] };

export function HomePage(): JSX.Element {
  const location = useLocation();
  const [search, setSearch] = useState("");
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadServers(nextSearch?: string): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const query = nextSearch?.trim() ? `?search=${encodeURIComponent(nextSearch.trim())}` : "";
      const data = await apiRequest<HomeResponse>(`/servers${query}`);
      setServers(data.servers);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de charger les serveurs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const initialSearch = params.get("search") ?? "";
    if (initialSearch) {
      setSearch(initialSearch);
      void loadServers(initialSearch);
      return;
    }
    void loadServers();
  }, [location.search]);

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void loadServers(search);
  }

  return (
    <section className="page home-page home-page-v2">
      <div className="home-v2-hero-bleed">
        <div className="home-v2-hero">
          <div className="home-v2-hero-inner">
            <div className="home-v2-hero-copy">
              <h1>Découvrir des serveurs</h1>
              <p className="home-v2-subtitle">Recherchez un serveur et rejoignez-le en un clic.</p>

              <form className="home-v2-search" onSubmit={onSubmit}>
                <div className="home-v2-search-row">
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Rechercher un serveur (nom, mot-clé...)"
                    aria-label="Rechercher un serveur"
                  />
                  <button className="btn" type="submit">
                    Rechercher
                  </button>
                </div>
              </form>

              <div className="home-v2-cta-row">
                <Link className="btn home-v2-primary-cta" to="/add-server">
                  Ajouter mon serveur
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <section className="home-v2-section" aria-label="Liste des serveurs">
        <div className="home-v2-section-head">
          <div>
            <h2>Serveurs</h2>
            <p>{servers.length} résultat(s)</p>
          </div>
        </div>

        {loading && <p>Chargement...</p>}
        {error && <p className="error-text">{error}</p>}
        {!loading && !error && servers.length === 0 && <p>Aucun serveur trouvé.</p>}
        <div className="home-v2-server-grid">
          {!loading && !error && servers.map((server) => <ServerCard key={server.id} server={server} />)}
        </div>
      </section>
    </section>
  );
}
