import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-semibold ${isActive ? "bg-accent/20 text-accent" : "text-slate-200 hover:bg-surface2"}`;

export function Navbar() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
      <NavLink to="/" className="text-lg font-extrabold tracking-tight">
        AquiAyudamosVE
      </NavLink>
      <nav className="ml-auto flex flex-wrap items-center gap-1">
        <NavLink to="/" end className={linkClass}>
          Inicio
        </NavLink>
        <NavLink to="/necesito-ayuda" className={linkClass}>
          Necesito ayuda
        </NavLink>
        <NavLink to="/reportar" className={linkClass}>
          Reportar
        </NavLink>
        {profile && (profile.role === "moderator" || profile.role === "admin") && (
          <NavLink to="/admin" className={linkClass}>
            Panel admin
          </NavLink>
        )}
        {profile ? (
          <>
            <NavLink to="/perfil" className={linkClass}>
              Perfil
            </NavLink>
            <button
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-400 hover:bg-surface2"
              onClick={async () => {
                await logout();
                navigate("/");
              }}
            >
              Salir
            </button>
          </>
        ) : (
          <NavLink to="/login" className={linkClass}>
            Ingresar
          </NavLink>
        )}
      </nav>
    </header>
  );
}
