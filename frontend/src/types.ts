export type CategoryGroup = "ayuda" | "necesidad" | "critico" | "info";

export type TrustLevel =
  | "sin_verificar"
  | "en_proceso"
  | "confirmado"
  | "institucional"
  | "desactualizada"
  | "cuestionada";

export type NeedStatus =
  | "necesitamos"
  | "en_camino"
  | "parcialmente_cubierto"
  | "cubierto"
  | "excedente"
  | "desactualizado";

export type LocationSource = "gps" | "catalog" | "manual";

export type CommitmentStatus = "committed" | "on_the_way" | "delivered" | "cancelled";

export interface Commitment {
  id: string;
  quantity: number;
  unit: string | null;
  status: CommitmentStatus;
  estimatedArrival: string | null;
  transportMethod: string | null;
  note: string | null;
  createdAt: string;
  mine: boolean;
}

export interface Category {
  id: string;
  group: CategoryGroup;
  key: string;
  label: string;
  active: boolean;
  sortOrder: number;
}

export interface TimelineEntry {
  at: string;
  text: string;
}

export interface Evidence {
  id: string;
  imageUrl: string | null;
  sourceUrl: string | null;
  relatedOrgName: string | null;
  createdAt: string;
}

export interface Report {
  id: string;
  title: string;
  description: string;
  departmentName: string;
  municipalityName: string;
  localityName: string | null;
  locationSource: LocationSource;
  approxLocationText: string | null;
  lat: number;
  lng: number;
  isSensitive: boolean;
  needStatus: NeedStatus | null;
  needStatusLabel: string | null;
  quantityNeeded: number | null;
  quantityUnit: string | null;
  quantityReceived: number;
  quantityPending: number | null;
  status: "active" | "inactive" | "hidden";
  category: { key: string; label: string; group: CategoryGroup };
  organization: { name: string; verified: boolean } | null;
  trustScore: number;
  trustLevel: TrustLevel;
  trustLevelLabel: string;
  trustLevelDescription: string;
  confirmationsCount: number;
  createdAt: string;
  lastConfirmedAt: string;
  createdById: string;
  evidence: Evidence[];
  timeline: TimelineEntry[];
  needCommitments: Commitment[];
}

export type ShareStatus = "confirmed" | "institutional" | "covered" | "surplus" | "questioned" | "unconfirmed";
export type ShareChannel = "whatsapp" | "web_share" | "copy_link" | "save_image";

export interface ShareCard {
  imageUrl: string | null;
  shareUrl: string;
  whatsappText: string;
  status: ShareStatus;
}

export interface Profile {
  id: string;
  displayName: string;
  role: "citizen" | "moderator" | "admin";
  reputationLevel: string;
  organization: { name: string; verified: boolean } | null;
  createdAt: string;
}

export type PetReportType = "lost" | "found" | "injured" | "needs_help";
export type PetSpecies = "dog" | "cat" | "bird" | "rabbit" | "horse" | "other";
export type PetSex = "male" | "female" | "unknown";
export type PetSize = "small" | "medium" | "large";
export type PetStatus =
  | "lost"
  | "sighted"
  | "sheltered"
  | "possible_match"
  | "found"
  | "reunited"
  | "needs_help"
  | "closed"
  | "outdated";
export type PetHelpCategory = "veterinary" | "food" | "water" | "transport" | "shelter" | "rescue" | "other";

export interface PetReport {
  id: string;
  reportType: PetReportType;
  species: PetSpecies;
  name: string | null;
  breed: string | null;
  sex: PetSex;
  size: PetSize | null;
  primaryColor: string | null;
  distinctiveFeatures: string | null;
  description: string;
  imageUrl: string | null;
  status: PetStatus;
  helpCategory: PetHelpCategory | null;
  isEmergency: boolean | null;
  departmentName: string;
  municipalityName: string;
  localityName: string | null;
  approxLocationText: string | null;
  lat: number;
  lng: number;
  locationSource: LocationSource;
  happenedAt: string | null;
  isSheltered: boolean;
  createdById: string;
  createdAt: string;
  lastConfirmedAt: string;
  // Solo presentes cuando el pet viene de GET /api/pets/:id (detalle) — el
  // listado/mapa no los calcula, evita un N+1 sobre hasta 100 filas (ver
  // pets.service.ts#getPetReport).
  confirmationsCount?: number;
  incorrectCount?: number;
}

// "LA VI AQUÍ", Fase 2 — nunca expone quién lo reportó (ver
// pets.service.ts#serializeSighting).
export interface PetSighting {
  id: string;
  lat: number | null;
  lng: number | null;
  note: string | null;
  createdAt: string;
}

export interface PossibleMatch extends PetReport {
  distanceMeters: number;
}

// Revelar contacto, Fase 2 — email puede faltar si el creador es un guest
// que solo dio celular (correo sintético, nunca se expone — ver
// pets.service.ts#revealPetContact).
export interface RevealedPetContact {
  displayName: string;
  email?: string;
  phone?: string;
}

export type PetShareStatus = "lost" | "found" | "reunited" | "needs_help";

export interface PetShareCard {
  imageUrl: string | null;
  shareUrl: string;
  whatsappText: string;
  status: PetShareStatus;
}
