import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2.5 text-sm font-semibold ${isActive ? "bg-accent/20 text-accent" : "text-slate-200 hover:bg-surface2"}`;

export function Navbar() {
  const { profile, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    setOpen(false);
    await logout();
    navigate("/");
  }

  const rest = (
    <>
      <NavLink to="/" end className={linkClass} onClick={() => setOpen(false)}>
        Inicio
      </NavLink>
      <NavLink to="/reportar" className={linkClass} onClick={() => setOpen(false)}>
        Reportar
      </NavLink>
      {profile && (profile.role === "moderator" || profile.role === "admin") && (
        <NavLink to="/admin" className={linkClass} onClick={() => setOpen(false)}>
          Panel admin
        </NavLink>
      )}
      {profile ? (
        <>
          <NavLink to="/perfil" className={linkClass} onClick={() => setOpen(false)}>
            Perfil
          </NavLink>
          <button
            className="rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-400 hover:bg-surface2"
            onClick={handleLogout}
          >
            Salir
          </button>
        </>
      ) : (
        <NavLink to="/login" className={linkClass} onClick={() => setOpen(false)}>
          Ingresar
        </NavLink>
      )}
    </>
  );

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface px-4 py-2.5">
      <div className="flex items-center gap-3">
        <NavLink to="/" className="flex flex-col items-center leading-none" onClick={() => setOpen(false)}>
          <img src="/logo-mark.png" alt="" className="h-8 w-auto" />
          <span className="mt-0.5 whitespace-nowrap text-[10px] font-bold tracking-wide text-slate-200">
            Aquí Ayudamos, <span className="text-brand">Ve</span>
          </span>
        </NavLink>

        {/* Desktop nav: everything inline */}
        <nav className="ml-auto hidden flex-wrap items-center gap-1 md:flex">
          <NavLink to="/necesito-ayuda" className={linkClass} onClick={() => setOpen(false)}>
            Necesito ayuda
          </NavLink>
          {rest}
        </nav>

        {/* Mobile: only the primary CTA + hamburger for everything else */}
        <div className="ml-auto flex items-center gap-2 md:hidden">
          <NavLink
            to="/necesito-ayuda"
            onClick={() => setOpen(false)}
            className="rounded-lg bg-danger px-3 py-2 text-xs font-bold text-white"
          >
            Necesito ayuda
          </NavLink>
          <button
            type="button"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-200 hover:bg-surface2"
          >
            {open ? (
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {open && <nav className="mt-3 flex flex-col gap-1 border-t border-border pt-3 md:hidden">{rest}</nav>}
    </header>
  );
}
