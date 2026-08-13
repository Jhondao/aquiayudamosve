import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { Report } from "../types";
import { GROUP_META } from "./categoryStyle";
import { NEED_STATUS_META } from "./needStatusStyle";

const CITY_CENTER: Record<string, [number, number]> = {
  Cali: [3.4516, -76.532],
  Pereira: [4.8087, -75.6906],
  Manizales: [5.0703, -75.5138],
  Armenia: [4.5339, -75.6811],
  Quibdó: [5.6947, -76.6611],
};

function RecenterOnCity({ city }: { city?: string }) {
  const map = useMap();
  useEffect(() => {
    if (city && CITY_CENTER[city]) {
      map.setView(CITY_CENTER[city], 13);
    }
  }, [city, map]);
  return null;
}

export function MapView({
  reports,
  city,
  onSelect,
}: {
  reports: Report[];
  city?: string;
  onSelect: (id: string) => void;
}) {
  const center = (city ? CITY_CENTER[city] : undefined) ?? CITY_CENTER.Cali;

  return (
    <div className="h-[420px] w-full overflow-hidden rounded-2xl border border-border">
      <MapContainer center={center} zoom={13} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <RecenterOnCity city={city} />
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
                  <div className="text-xs text-slate-500">{r.approxLocationText}</div>
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
