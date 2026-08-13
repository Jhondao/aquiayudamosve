import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { Report } from "../types";
import { GROUP_META } from "./categoryStyle";
import { NEED_STATUS_META } from "./needStatusStyle";

const COLOMBIA_CENTER: [number, number] = [4.5, -74.3];
const COLOMBIA_ZOOM = 5;

// ACTUALIZACIÓN DEL PROMPT MAESTRO — ya no hay coordenadas por ciudad (el
// catálogo territorial no trae centroides para ~1,124 municipios). Centra
// sobre los marcadores realmente visibles en vez de un punto fijo por
// ciudad; sin marcadores, cae a una vista de Colombia completa.
function FitToReports({ reports }: { reports: Report[] }) {
  const map = useMap();
  useEffect(() => {
    if (reports.length === 0) {
      map.setView(COLOMBIA_CENTER, COLOMBIA_ZOOM);
      return;
    }
    map.fitBounds(
      reports.map((r) => [r.lat, r.lng] as [number, number]),
      { padding: [30, 30], maxZoom: 15 }
    );
  }, [reports, map]);
  return null;
}

export function MapView({ reports, onSelect }: { reports: Report[]; onSelect: (id: string) => void }) {
  return (
    <div className="h-[420px] w-full overflow-hidden rounded-2xl border border-border">
      <MapContainer center={COLOMBIA_CENTER} zoom={COLOMBIA_ZOOM} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToReports reports={reports} />
        {reports.map((r) => {
          // Un punto ya cubierto/con excedente se marca en verde/azul en el
          // mapa mismo — es lo que evita que alguien lleve agua a un punto
          // ya resuelto sin tener que abrir el popup para enterarse.
          const overrideStatus = r.needStatus === "cubierto" || r.needStatus === "excedente" ? r.needStatus : null;
          const markerColor = overrideStatus ? NEED_STATUS_META[overrideStatus].mapColor : GROUP_META[r.category.group].markerColor;

          return (
            <CircleMarker
              key={r.id}
              center={[r.lat, r.lng]}
              radius={9}
              pathOptions={{
                color: markerColor,
                fillColor: markerColor,
                fillOpacity: 0.85,
                weight: r.organization ? 3 : 1,
              }}
            >
              <Tooltip permanent direction="top" offset={[0, -6]} className="map-tag">
                {r.category.label}
              </Tooltip>
              <Popup>
                <div className="max-w-[220px] text-sm">
                  <span
                    className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ background: `${GROUP_META[r.category.group].markerColor}33`, color: GROUP_META[r.category.group].markerColor }}
                  >
                    {r.category.label}
                  </span>
                  <div className="mt-1 font-semibold">{r.title}</div>
                  <div className="text-xs text-slate-500">
                    {r.approxLocationText ?? `${r.municipalityName}, ${r.departmentName}`}
                  </div>
                  {r.needStatus && (
                    <div className="mt-1 text-xs font-bold" style={{ color: NEED_STATUS_META[r.needStatus].mapColor }}>
                      {NEED_STATUS_META[r.needStatus].emoji} {r.needStatusLabel}
                      {r.quantityNeeded != null && ` — ${r.quantityReceived}/${r.quantityNeeded} ${r.quantityUnit ?? ""}`}
                    </div>
                  )}
                  <button
                    className="mt-1 text-xs font-semibold text-blue-600 underline"
                    onClick={() => onSelect(r.id)}
                  >
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
