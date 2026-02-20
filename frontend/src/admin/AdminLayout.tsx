import { Link, NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function AdminLayout(): JSX.Element {
  const { user, logout } = useAuth();

  return (
    <section className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <p className="admin-brand-kicker">QUOKKA</p>
          <h1>Backoffice Admin</h1>
          <p>Gestion complète du site</p>
        </div>

        <nav className="admin-nav">
          <NavLink to="/admin/users">Utilisateurs</NavLink>
          <NavLink to="/admin/servers">Serveurs</NavLink>
          <NavLink to="/admin/subscriptions">Abonnements</NavLink>
          <NavLink to="/admin/warnings">Avertissements</NavLink>
          <NavLink to="/admin/manual-activation">Activation manuelle</NavLink>
          <NavLink to="/admin/promo-codes">Codes promo</NavLink>
          <NavLink to="/admin/settings">Paramétrage du site</NavLink>
        </nav>

        <div className="admin-sidebar-footer">
          <p>
            Connecté en tant que <strong>{user?.pseudo}</strong>
          </p>
          <Link className="btn btn-ghost admin-back-to-site" to="/">
            Retour au site
          </Link>
          <button className="btn btn-ghost" type="button" onClick={logout}>
            Déconnexion
          </button>
        </div>
      </aside>

      <div className="admin-content">
        <article className="card admin-topbar">
          <div>
            <h2>Panneau de contrôle</h2>
            <p>Vue opérationnelle avec filtres avancés, pagination et actions rapides.</p>
          </div>
          <span className="status-pill status-paid">Panel SaaS</span>
        </article>
        <Outlet />
      </div>
    </section>
  );
}
