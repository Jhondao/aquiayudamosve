import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { PetReport } from "../types";
import { PET_SPECIES_META, PET_STATUS_META } from "./petStatusStyle";

const COLOMBIA_CENTER: [number, number] = [4.5, -74.3];
const COLOMBIA_ZOOM = 5;

// Copia del setup de MapView.tsx (CircleMarker, nunca Marker — el mismo
// problema de íconos rotos con Vite) en vez de generalizar ese componente,
// que está tipado específicamente a Report[]. Mapa propio y pequeño para
// /mascotas, no se mezcla con los filtros del mapa principal de reportes.
function FitToPets({ pets }: { pets: PetReport[] }) {
  const map = useMap();
  useEffect(() => {
    if (pets.length === 0) {
      map.setView(COLOMBIA_CENTER, COLOMBIA_ZOOM);
      return;
    }
    map.fitBounds(
      pets.map((p) => [p.lat, p.lng] as [number, number]),
      { padding: [30, 30], maxZoom: 15 }
    );
  }, [pets, map]);
  return null;
}

export function PetMapLayer({ pets, onSelect }: { pets: PetReport[]; onSelect: (id: string) => void }) {
  return (
    <div className="h-[360px] w-full overflow-hidden rounded-2xl border border-border">
      <MapContainer center={COLOMBIA_CENTER} zoom={COLOMBIA_ZOOM} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToPets pets={pets} />
        {pets.map((p) => {
          const statusMeta = PET_STATUS_META[p.status];
          const species = PET_SPECIES_META[p.species];
          return (
            <CircleMarker
              key={p.id}
              center={[p.lat, p.lng]}
              radius={9}
              pathOptions={{ color: statusMeta.mapColor, fillColor: statusMeta.mapColor, fillOpacity: 0.85, weight: 1 }}
            >
              <Tooltip permanent direction="top" offset={[0, -6]} className="map-tag">
                {species.emoji} {p.name ?? species.label}
              </Tooltip>
              <Popup>
                <div className="max-w-[220px] text-sm">
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ background: `${statusMeta.mapColor}33`, color: statusMeta.mapColor }}
                  >
                    {statusMeta.emoji} {statusMeta.label}
                  </span>
                  <div className="mt-1 font-semibold">
                    {species.emoji} {p.name ?? `${species.label} sin nombre`}
                  </div>
                  <div className="text-xs text-slate-500">
                    {p.approxLocationText ?? `${p.municipalityName}, ${p.departmentName}`}
                  </div>
                  <button className="mt-1 text-xs font-semibold text-blue-600 underline" onClick={() => onSelect(p.id)}>
                    Ver detalle
                  </button>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
