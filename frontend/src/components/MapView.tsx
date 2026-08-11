import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { Report } from "../types";
import { GROUP_META } from "./categoryStyle";

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
        {reports.map((r) => (
          <CircleMarker
            key={r.id}
            center={[r.lat, r.lng]}
            radius={9}
            pathOptions={{
              color: GROUP_META[r.category.group].markerColor,
              fillColor: GROUP_META[r.category.group].markerColor,
              fillOpacity: 0.85,
              weight: r.organization ? 3 : 1,
            }}
            eventHandlers={{ click: () => onSelect(r.id) }}
          >
            <Popup>
              <div className="max-w-[220px] text-sm">
                <div className="font-semibold">{r.title}</div>
                <div className="text-xs text-slate-500">{r.approxLocationText}</div>
                <button
                  className="mt-1 text-xs font-semibold text-blue-600 underline"
                  onClick={() => onSelect(r.id)}
                >
                  Ver detalle
                </button>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}
