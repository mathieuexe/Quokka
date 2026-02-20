import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { apiRequest } from "../lib/api";

type WarningEntry = {
  id: string;
  userId: string;
  userPseudo: string;
  adminPseudo: string;
  reason: string;
  createdAt: string;
  isActive: boolean;
};

type WarningsResponse = {
  warnings: WarningEntry[];
  totalCount: number;
};

type DateFilterType = "none" | "day" | "duration" | "range";

export function AdminWarningsPage(): JSX.Element {
  const { token } = useAuth();
  const [warnings, setWarnings] = useState<WarningEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [memberScope, setMemberScope] = useState<"all" | "member">("all");
  const [memberPseudo, setMemberPseudo] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>("none");
  const [dayDate, setDayDate] = useState("");
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [durationDays, setDurationDays] = useState(7);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (memberScope === "member" && memberPseudo.trim()) {
      params.set("targetUser", memberPseudo.trim().replace(/^@/, ""));
    }
    params.set("status", statusFilter);

    let from: string | undefined;
    let to: string | undefined;

    if (dateFilterType === "day" && dayDate) {
      from = new Date(`${dayDate}T00:00:00`).toISOString();
      to = new Date(`${dayDate}T23:59:59`).toISOString();
    }
    if (dateFilterType === "range") {
      if (rangeFrom) from = new Date(`${rangeFrom}T00:00:00`).toISOString();
      if (rangeTo) to = new Date(`${rangeTo}T23:59:59`).toISOString();
    }
    if (dateFilterType === "duration") {
      const safeDays = Math.max(1, Math.floor(durationDays));
      const now = new Date();
      const fromDate = new Date(now.getTime() - safeDays * 24 * 60 * 60 * 1000);
      from = fromDate.toISOString();
      to = now.toISOString();
    }

    if (from) params.set("from", from);
    if (to) params.set("to", to);

    params.set("limit", String(pageSize));
    params.set("offset", String((page - 1) * pageSize));
    return params;
  }, [memberScope, memberPseudo, statusFilter, dateFilterType, dayDate, rangeFrom, rangeTo, durationDays, page, pageSize]);

  useEffect(() => {
    setPage(1);
  }, [memberScope, memberPseudo, statusFilter, dateFilterType, dayDate, rangeFrom, rangeTo, durationDays, pageSize]);

  useEffect(() => {
    async function loadWarnings(): Promise<void> {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const data = await apiRequest<WarningsResponse>(`/chat/moderation/warnings/all?${queryParams.toString()}`, { token });
        setWarnings(data.warnings);
        setTotalCount(data.totalCount);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Impossible de charger les avertissements.");
      } finally {
        setLoading(false);
      }
    }
    void loadWarnings();
  }, [token, queryParams]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const activeCount = useMemo(() => warnings.filter((entry) => entry.isActive).length, [warnings]);
  const inactiveCount = useMemo(() => warnings.filter((entry) => !entry.isActive).length, [warnings]);

  return (
    <div className="admin-page">
      <div className="admin-page-head">
        <h2>Avertissements</h2>
        <p>Suivi des avertissements de modération avec filtres avancés.</p>
      </div>

      <article className="card admin-kpi-grid">
        <div className="admin-kpi-box">
          <span>Résultat filtré</span>
          <strong>{totalCount}</strong>
        </div>
        <div className="admin-kpi-box">
          <span>Actifs</span>
          <strong>{activeCount}</strong>
        </div>
        <div className="admin-kpi-box">
          <span>Inactifs</span>
          <strong>{inactiveCount}</strong>
        </div>
      </article>

      <article className="card admin-filter-grid">
        <label>
          Portée
          <select value={memberScope} onChange={(event) => setMemberScope(event.target.value as "all" | "member")}>
            <option value="all">Tout le monde</option>
            <option value="member">Un membre</option>
          </select>
        </label>
        <label>
          Membre
          <input
            value={memberPseudo}
            onChange={(event) => setMemberPseudo(event.target.value)}
            placeholder="@pseudo"
            disabled={memberScope !== "member"}
          />
        </label>
        <label>
          Statut
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | "active" | "inactive")}>
            <option value="all">Tous</option>
            <option value="active">Actifs</option>
            <option value="inactive">Inactifs</option>
          </select>
        </label>
        <label>
          Filtre date
          <select value={dateFilterType} onChange={(event) => setDateFilterType(event.target.value as DateFilterType)}>
            <option value="none">Aucun</option>
            <option value="day">Jour précis</option>
            <option value="duration">Durée</option>
            <option value="range">Période</option>
          </select>
        </label>
        <label>
          Jour
          <input type="date" value={dayDate} onChange={(event) => setDayDate(event.target.value)} disabled={dateFilterType !== "day"} />
        </label>
        <label>
          Durée (jours)
          <input
            type="number"
            min={1}
            value={durationDays}
            onChange={(event) => setDurationDays(Number(event.target.value))}
            disabled={dateFilterType !== "duration"}
          />
        </label>
        <label>
          Début
          <input type="date" value={rangeFrom} onChange={(event) => setRangeFrom(event.target.value)} disabled={dateFilterType !== "range"} />
        </label>
        <label>
          Fin
          <input type="date" value={rangeTo} onChange={(event) => setRangeTo(event.target.value)} disabled={dateFilterType !== "range"} />
        </label>
        <label>
          Par page
          <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
      </article>

      {loading ? (
        <p>Chargement des avertissements...</p>
      ) : error ? (
        <p className="error-text">{error}</p>
      ) : warnings.length === 0 ? (
        <p>Aucun avertissement trouvé pour ce filtre.</p>
      ) : (
        <div className="admin-table-wrap">
          {warnings.map((entry) => (
            <div key={entry.id} className="admin-list-item static">
              <div>
                <h3>{entry.userPseudo}</h3>
                <p>{entry.reason}</p>
                <p>Par {entry.adminPseudo}</p>
              </div>
              <div className="admin-list-item-meta">
                <span className={`status-pill ${entry.isActive ? "status-paid" : "status-failed"}`}>
                  {entry.isActive ? "Actif" : "Inactif"}
                </span>
                <span className="tag">
                  {new Date(entry.createdAt).toLocaleDateString("fr-FR")} {new Date(entry.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>
          ))}
          <div className="admin-pagination">
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
            >
              Précédent
            </button>
            <span>
              Page {page} / {totalPages}
            </span>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page >= totalPages}
            >
              Suivant
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
