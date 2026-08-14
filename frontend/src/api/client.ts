import type {
  Category,
  CommitmentStatus,
  NeedStatus,
  PetHelpCategory,
  PetReport,
  PetReportType,
  PetResource,
  PetResourceCategory,
  PetShareCard,
  PetSex,
  PetSighting,
  PetSize,
  PetSpecies,
  PetStatus,
  PossibleMatch,
  Profile,
  Report,
  RevealedPetContact,
  ShareCard,
  ShareChannel,
} from "../types";

// Kept in memory only — never localStorage/sessionStorage, so an XSS payload
// reading storage can't lift a long-lived credential. Refresh token lives in
// an httpOnly cookie the JS layer never touches directly.
let accessToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function onSessionExpired(cb: (() => void) | null) {
  onUnauthorized = cb;
}

class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch("/api/auth/refresh", { method: "POST", credentials: "include" })
      .then(async (res) => {
        if (!res.ok) return false;
        const data = await res.json();
        setAccessToken(data.accessToken);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData) && options.body) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);

  const res = await fetch(path, { ...options, headers, credentials: "include" });

  if (res.status === 401 && retry && path !== "/api/auth/refresh" && path !== "/api/auth/login") {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(path, options, false);
    setAccessToken(null);
    onUnauthorized?.();
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `Error ${res.status}`, body?.details);
  }
  return body as T;
}

export const api = {
  register: (email: string, password: string, displayName: string) =>
    request<{ accessToken: string; profile: Profile }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, password, displayName }),
    }),
  login: (email: string, password: string) =>
    request<{ accessToken: string; profile: Profile }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  refresh: () => request<{ accessToken: string; profile: Profile }>("/api/auth/refresh", { method: "POST" }, false),
  me: () => request<{ profile: Profile }>("/api/auth/me"),

  getCategories: () => request<{ categories: Category[] }>("/api/categories"),

  getReports: (
    params: {
      departmentName?: string;
      municipalityName?: string;
      group?: string;
      institutional?: boolean;
      page?: number;
      pageSize?: number;
    } = {}
  ) => {
    const qs = new URLSearchParams();
    if (params.departmentName) qs.set("departmentName", params.departmentName);
    if (params.municipalityName) qs.set("municipalityName", params.municipalityName);
    if (params.group) qs.set("group", params.group);
    if (params.institutional) qs.set("institutional", "true");
    if (params.page) qs.set("page", String(params.page));
    if (params.pageSize) qs.set("pageSize", String(params.pageSize));
    return request<{ reports: Report[]; total: number }>(`/api/reports?${qs.toString()}`);
  },
  getReport: (id: string) => request<Report>(`/api/reports/${id}`),
  getNearby: (params: { lat: number; lng: number; radiusMeters?: number; categoryKey?: string }) => {
    const qs = new URLSearchParams({
      lat: String(params.lat),
      lng: String(params.lng),
      ...(params.radiusMeters ? { radiusMeters: String(params.radiusMeters) } : {}),
      ...(params.categoryKey ? { categoryKey: params.categoryKey } : {}),
    });
    return request<{ reports: Report[] }>(`/api/reports/nearby?${qs.toString()}`);
  },
  createReport: (data: {
    categoryKey: string;
    title: string;
    description: string;
    departmentName: string;
    municipalityName: string;
    localityName?: string;
    locationSource: "gps" | "catalog" | "manual";
    approxLocationText?: string;
    lat: number;
    lng: number;
    quantityNeeded?: number;
    quantityUnit?: string;
    email?: string;
    phone?: string;
  }) => request<Report>("/api/reports", { method: "POST", body: JSON.stringify(data) }),
  confirmReport: (
    id: string,
    type: "confirm" | "unsure" | "incorrect",
    guest?: { displayName: string; email?: string; phone?: string; recaptchaToken?: string | null; website?: string }
  ) => request<Report>(`/api/reports/${id}/confirm`, { method: "POST", body: JSON.stringify({ type, ...guest }) }),
  flagReport: (id: string, reason: string) =>
    request<Report>(`/api/reports/${id}/flag`, { method: "POST", body: JSON.stringify({ reason }) }),
  addUpdate: (id: string, text: string, deactivates?: boolean) =>
    request<Report>(`/api/reports/${id}/update`, { method: "POST", body: JSON.stringify({ text, deactivates }) }),
  updateNeedStatus: (id: string, data: { needStatus?: NeedStatus; quantityReceived?: number }) =>
    request<Report>(`/api/reports/${id}/need-status`, { method: "POST", body: JSON.stringify(data) }),
  createCommitment: (
    id: string,
    data: {
      quantity: number;
      unit?: string;
      status?: "committed" | "on_the_way";
      estimatedArrival?: string;
      transportMethod?: string;
      note?: string;
    }
  ) => request<Report>(`/api/reports/${id}/commitments`, { method: "POST", body: JSON.stringify(data) }),
  updateCommitment: (
    id: string,
    commitmentId: string,
    data: { status?: CommitmentStatus; estimatedArrival?: string; note?: string }
  ) => request<Report>(`/api/reports/${id}/commitments/${commitmentId}`, { method: "PATCH", body: JSON.stringify(data) }),

  // Públicos, sin auth — compartir un reporte no requiere sesión.
  getShareCard: (id: string) => request<ShareCard>(`/api/reports/${id}/share-card`),
  recordShareEvent: (id: string, channel: ShareChannel) =>
    request<{ ok: true }>(`/api/reports/${id}/share-event`, { method: "POST", body: JSON.stringify({ channel }) }),

  myReports: () => request<{ profile: Profile; reports: Partial<Report>[] }>("/api/users/me/reports"),

  getFlaggedReports: () => request<{ reports: Report[] }>("/api/admin/reports/flagged"),
  getAllReports: (params: { departmentName?: string; municipalityName?: string; status?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.departmentName) qs.set("departmentName", params.departmentName);
    if (params.municipalityName) qs.set("municipalityName", params.municipalityName);
    if (params.status) qs.set("status", params.status);
    return request<{ reports: Report[] }>(`/api/admin/reports?${qs.toString()}`);
  },
  moderateReport: (id: string, action: "hide" | "unhide" | "markFalse" | "resolve" | "delete", reason: string) =>
    request<Report | null>(`/api/admin/reports/${id}`, { method: "PATCH", body: JSON.stringify({ action, reason }) }),
  getAuditLogs: () =>
    request<{ logs: { id: string; action: string; entityType: string; entityId: string; createdAt: string; actor: { displayName: string } | null }[] }>(
      "/api/admin/audit-logs"
    ),

  getOrganizations: () => request<{ organizations: { id: string; name: string; type: string; verified: boolean }[] }>("/api/organizations"),
  verifyOrganization: (id: string) => request(`/api/organizations/${id}/verify`, { method: "POST" }),

  getPushPublicKey: () => request<{ publicKey: string }>("/api/push/vapid-public-key"),
  pushSubscribe: (sub: PushSubscriptionJSON) => request<{ ok: true }>("/api/push/subscribe", { method: "POST", body: JSON.stringify(sub) }),
  pushUnsubscribe: (endpoint: string) => request<{ ok: true }>("/api/push/unsubscribe", { method: "POST", body: JSON.stringify({ endpoint }) }),

  // Mascotas — POST /api/pets es multipart (la foto viaja en el mismo
  // request, no como paso aparte) así que arma su propio FormData en vez de
  // JSON.stringify. Pasa por request() igual que todo lo demás, NUNCA un
  // fetch crudo — ese helper ya adjunta el header Authorization incluso con
  // body FormData (solo omite fijar Content-Type, que el navegador debe
  // completar solo con el boundary correcto).
  createPetReport: (
    data: {
      reportType: PetReportType;
      species: PetSpecies;
      name?: string;
      breed?: string;
      sex?: PetSex;
      size?: PetSize;
      primaryColor?: string;
      distinctiveFeatures?: string;
      description: string;
      departmentName: string;
      municipalityName: string;
      localityName?: string;
      locationSource: "gps" | "catalog" | "manual";
      approxLocationText?: string;
      lat: number;
      lng: number;
      happenedAt?: string;
      isSheltered?: boolean;
      helpCategory?: PetHelpCategory;
      isEmergency?: boolean;
      displayName?: string;
      email?: string;
      phone?: string;
      recaptchaToken?: string | null;
      website?: string;
    },
    photo?: File | null
  ) => {
    const form = new FormData();
    const append = (key: string, value: string | number | undefined | null) => {
      if (value === undefined || value === null || value === "") return;
      form.append(key, String(value));
    };
    append("reportType", data.reportType);
    append("species", data.species);
    append("name", data.name);
    append("breed", data.breed);
    append("sex", data.sex);
    append("size", data.size);
    append("primaryColor", data.primaryColor);
    append("distinctiveFeatures", data.distinctiveFeatures);
    append("description", data.description);
    append("departmentName", data.departmentName);
    append("municipalityName", data.municipalityName);
    append("localityName", data.localityName);
    append("locationSource", data.locationSource);
    append("approxLocationText", data.approxLocationText);
    append("lat", data.lat);
    append("lng", data.lng);
    append("happenedAt", data.happenedAt);
    // Explícitos siempre (no omitidos) — booleanString en el backend lee el
    // string literal "true"/"false", nunca Boolean(str).
    form.append("isSheltered", data.isSheltered ? "true" : "false");
    append("helpCategory", data.helpCategory);
    form.append("isEmergency", data.isEmergency ? "true" : "false");
    append("displayName", data.displayName);
    append("email", data.email);
    append("phone", data.phone);
    append("recaptchaToken", data.recaptchaToken ?? undefined);
    if (photo) form.append("photo", photo);
    return request<PetReport>("/api/pets", { method: "POST", body: form });
  },
  getPetReports: (
    params: {
      reportType?: PetReportType;
      species?: PetSpecies;
      status?: PetStatus;
      departmentName?: string;
      municipalityName?: string;
      page?: number;
      pageSize?: number;
    } = {}
  ) => {
    const qs = new URLSearchParams();
    if (params.reportType) qs.set("reportType", params.reportType);
    if (params.species) qs.set("species", params.species);
    if (params.status) qs.set("status", params.status);
    if (params.departmentName) qs.set("departmentName", params.departmentName);
    if (params.municipalityName) qs.set("municipalityName", params.municipalityName);
    if (params.page) qs.set("page", String(params.page));
    if (params.pageSize) qs.set("pageSize", String(params.pageSize));
    return request<{ pets: PetReport[]; total: number; page: number; pageSize: number }>(`/api/pets?${qs.toString()}`);
  },
  getPetReport: (id: string) => request<PetReport>(`/api/pets/${id}`),
  updatePetStatus: (id: string, data: { status: PetStatus; note?: string }) =>
    request<PetReport>(`/api/pets/${id}/status`, { method: "PATCH", body: JSON.stringify(data) }),

  getPetShareCard: (id: string) => request<PetShareCard>(`/api/pets/${id}/share-card`),
  recordPetShareEvent: (id: string, channel: ShareChannel) =>
    request<{ ok: true }>(`/api/pets/${id}/share-event`, { method: "POST", body: JSON.stringify({ channel }) }),

  // Fase 2 — confirmar/avistar/revelar contacto son JSON planos, sin foto,
  // así que van directo por JSON.stringify (a diferencia de createPetReport).
  confirmPet: (
    id: string,
    type: "confirm" | "incorrect",
    guest?: { displayName: string; email?: string; phone?: string; recaptchaToken?: string | null; website?: string }
  ) => request<PetReport>(`/api/pets/${id}/confirm`, { method: "POST", body: JSON.stringify({ type, ...guest }) }),
  createPetSighting: (
    id: string,
    data: { lat?: number; lng?: number; note?: string },
    guest?: { displayName: string; email?: string; phone?: string; recaptchaToken?: string | null; website?: string }
  ) => request<PetSighting>(`/api/pets/${id}/sightings`, { method: "POST", body: JSON.stringify({ ...data, ...guest }) }),
  getPetSightings: (id: string) => request<PetSighting[]>(`/api/pets/${id}/sightings`),
  getPossibleMatches: (id: string) => request<PossibleMatch[]>(`/api/pets/${id}/possible-matches`),
  revealPetContact: (
    id: string,
    guest?: { displayName: string; email?: string; phone?: string; recaptchaToken?: string | null; website?: string }
  ) => request<RevealedPetContact>(`/api/pets/${id}/reveal-contact`, { method: "POST", body: JSON.stringify({ ...guest }) }),

  getAllPets: (params: { departmentName?: string; municipalityName?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.departmentName) qs.set("departmentName", params.departmentName);
    if (params.municipalityName) qs.set("municipalityName", params.municipalityName);
    return request<{ pets: (PetReport & { hidden: boolean })[] }>(`/api/admin/pets?${qs.toString()}`);
  },
  moderatePet: (id: string, action: "hide" | "unhide" | "delete", reason: string) =>
    request<(PetReport & { hidden: boolean }) | null>(`/api/admin/pets/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action, reason }),
    }),

  // Fase 3 — directorio "quiero ayudar con mascotas".
  createPetResource: (data: {
    category: PetResourceCategory;
    name: string;
    description: string;
    contactName: string;
    contactEmail?: string;
    contactPhone?: string;
    departmentName: string;
    municipalityName: string;
    availabilityNote?: string;
  }) => request<PetResource>("/api/pets/resources", { method: "POST", body: JSON.stringify(data) }),
  getPetResources: (
    params: { category?: PetResourceCategory; departmentName?: string; municipalityName?: string; page?: number; pageSize?: number } = {}
  ) => {
    const qs = new URLSearchParams();
    if (params.category) qs.set("category", params.category);
    if (params.departmentName) qs.set("departmentName", params.departmentName);
    if (params.municipalityName) qs.set("municipalityName", params.municipalityName);
    if (params.page) qs.set("page", String(params.page));
    if (params.pageSize) qs.set("pageSize", String(params.pageSize));
    return request<{ resources: PetResource[]; total: number; page: number; pageSize: number }>(`/api/pets/resources?${qs.toString()}`);
  },
  getPetResource: (id: string) => request<PetResource>(`/api/pets/resources/${id}`),

  getAllPetResources: (params: { departmentName?: string; municipalityName?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.departmentName) qs.set("departmentName", params.departmentName);
    if (params.municipalityName) qs.set("municipalityName", params.municipalityName);
    return request<{ resources: (PetResource & { hidden: boolean })[] }>(`/api/admin/pet-resources?${qs.toString()}`);
  },
  moderatePetResource: (id: string, action: "hide" | "unhide" | "delete", reason: string) =>
    request<(PetResource & { hidden: boolean }) | null>(`/api/admin/pet-resources/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ action, reason }),
    }),
};

export { ApiError };
