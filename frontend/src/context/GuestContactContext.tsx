import { createContext, useContext, useMemo, useState } from "react";

export interface GuestContact {
  displayName: string;
  email?: string;
  phone?: string;
}

interface GuestContactState {
  // Nunca se persiste (ni localStorage ni cookie) — solo vive en memoria
  // mientras dura la pestaña, igual que el access token (ver api/client.ts).
  // Se pide una sola vez por visita: quien confirma varios reportes en la
  // misma sesión no vuelve a escribir su nombre/correo cada vez.
  guestContact: GuestContact | null;
  rememberGuestContact: (contact: GuestContact) => void;
}

const GuestContactContext = createContext<GuestContactState | null>(null);

export function GuestContactProvider({ children }: { children: React.ReactNode }) {
  const [guestContact, setGuestContact] = useState<GuestContact | null>(null);
  const value = useMemo(() => ({ guestContact, rememberGuestContact: setGuestContact }), [guestContact]);
  return <GuestContactContext.Provider value={value}>{children}</GuestContactContext.Provider>;
}

export function useGuestContact() {
  const ctx = useContext(GuestContactContext);
  if (!ctx) throw new Error("useGuestContact must be used within GuestContactProvider");
  return ctx;
}
