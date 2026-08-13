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

export interface Profile {
  id: string;
  displayName: string;
  role: "citizen" | "moderator" | "admin";
  reputationLevel: string;
  organization: { name: string; verified: boolean } | null;
  createdAt: string;
}
