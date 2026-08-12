interface GuestContactFieldsProps {
  email: string;
  setEmail: (value: string) => void;
  phone: string;
  setPhone: (value: string) => void;
}

export function GuestContactFields({ email, setEmail, phone, setPhone }: GuestContactFieldsProps) {
  return (
    <div className="mt-4 rounded-xl border border-border bg-surface2/40 p-3">
      <p className="text-xs font-semibold text-slate-300">Publicando sin cuenta</p>
      <p className="mt-0.5 text-xs text-slate-500">
        Pedimos tu correo y celular para poder identificar tus reportes — no necesitas crear una contraseña.
      </p>
      <label className="mt-3 block text-xs font-semibold text-slate-400">Correo</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="tu@correo.com"
        className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
      />
      <label className="mt-3 block text-xs font-semibold text-slate-400">Celular</label>
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Ej: 3001234567"
        className="mt-1 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
      />
    </div>
  );
}
