interface GuestContactFieldsProps {
  email: string;
  setEmail: (value: string) => void;
  phone: string;
  setPhone: (value: string) => void;
  // Solo usado por el flujo de confirmar sin cuenta (ReportDetailPage) — el
  // formulario de reportar no pide nombre, deriva uno del correo.
  displayName?: string;
  setDisplayName?: (value: string) => void;
  // El formulario de reportar exige celular junto con el correo; confirmar
  // sin cuenta no — solo cambia la etiqueta, la validación real vive en
  // cada página.
  phoneRequired?: boolean;
  // Oculta el encabezado "Publicando sin cuenta..." cuando el formulario ya
  // tiene su propio texto introductorio (ej. la tarjeta de confirmar).
  compact?: boolean;
  // Honeypot anti-spam: un input que un humano real nunca ve ni llena (ver
  // reports.schemas.ts#confirmSchema, campo "website"). Si se pasa,
  // se renderiza oculto con CSS (nunca display:none/type=hidden).
  honeypot?: { value: string; setValue: (value: string) => void };
}

export function GuestContactFields({
  email,
  setEmail,
  phone,
  setPhone,
  displayName,
  setDisplayName,
  phoneRequired = true,
  compact,
  honeypot,
}: GuestContactFieldsProps) {
  return (
    <div className="mt-4 rounded-xl border border-border bg-surface2/40 p-3">
      {!compact && (
        <>
          <p className="text-xs font-semibold text-slate-300">Publicando sin cuenta</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Pedimos tu correo y celular para poder identificar tus reportes — no necesitas crear una contraseña.
          </p>
        </>
      )}
      {setDisplayName && (
        <>
          <label className="mt-3 block text-xs font-semibold text-slate-400">Nombre</label>
          <input
            value={displayName ?? ""}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Tu nombre"
            className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
          />
        </>
      )}
      <label className="mt-3 block text-xs font-semibold text-slate-400">Correo</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="tu@correo.com"
        className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
      />
      <label className="mt-3 block text-xs font-semibold text-slate-400">
        Celular{!phoneRequired && " (opcional)"}
      </label>
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Ej: 3001234567"
        className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
      />
      {honeypot && (
        <div className="sr-only" aria-hidden="true">
          <label htmlFor="website">No llenar este campo</label>
          <input
            id="website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot.value}
            onChange={(e) => honeypot.setValue(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
