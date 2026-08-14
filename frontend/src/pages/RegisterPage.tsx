import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export default function RegisterPage() {
  useDocumentTitle("Crear cuenta");

  const { register } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      await register(email, password, displayName);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la cuenta.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-10">
      <h1 className="text-xl font-extrabold">Crear cuenta</h1>
      <label className="mt-4 block text-xs font-semibold text-slate-400">Nombre</label>
      <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm" />
      <label className="mt-4 block text-xs font-semibold text-slate-400">Correo</label>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm" />
      <label className="mt-4 block text-xs font-semibold text-slate-400">Contraseña (mínimo 8 caracteres)</label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
      />
      {error && <p className="mt-3 rounded-lg bg-danger/20 px-3 py-2 text-sm text-danger">{error}</p>}
      <p className="mt-4 text-[11px] text-slate-500">
        Al crear tu cuenta aceptas nuestra{" "}
        <Link to="/privacidad" className="underline hover:text-slate-300">
          política de tratamiento de datos personales
        </Link>
        .
      </p>
      <button onClick={submit} disabled={submitting} className="mt-3 h-12 w-full rounded-xl bg-accent text-sm font-bold text-white disabled:opacity-50">
        {submitting ? "Creando…" : "CREAR CUENTA"}
      </button>
      <p className="mt-4 text-center text-xs text-slate-400">
        ¿Ya tienes cuenta? <Link to="/login" className="font-semibold text-accent">Inicia sesión</Link>
      </p>
    </div>
  );
}
