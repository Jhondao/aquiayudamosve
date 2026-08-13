import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { api } from "../api/client";
import { COLOMBIA_LOCATIONS } from "../data/colombiaLocations";
import type { LocationSource } from "../types";

const COLOMBIA_CENTER: [number, number] = [4.5, -74.3];
const COLOMBIA_ZOOM = 5;

export interface LocationValue {
  departmentName: string;
  municipalityName: string;
  localityName: string;
  approxLocationText: string;
  lat: number | null;
  lng: number | null;
  locationSource: LocationSource | null;
}

export const EMPTY_LOCATION: LocationValue = {
  departmentName: "",
  municipalityName: "",
  localityName: "",
  approxLocationText: "",
  lat: null,
  lng: null,
  locationSource: null,
};

type Mode = "gps" | "catalog" | "manual";

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

// Centra el mapa embebido: el pin (si existe) siempre gana sobre cualquier
// otro objetivo — una vez hay un punto real, el mapa sigue al punto, no al
// modo. Sin pin, "catalog" centra sobre reportes existentes en el municipio
// elegido (fitBounds); sin nada de eso, vista nacional.
function MapController({ bounds, pin }: { bounds: [number, number][]; pin: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (pin) {
      map.setView(pin, Math.max(map.getZoom(), 14));
    } else if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    } else {
      map.setView(COLOMBIA_CENTER, COLOMBIA_ZOOM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, bounds, map]);
  return null;
}

function modeButtonClass(active: boolean) {
  return `shrink-0 rounded-xl border px-3 py-2 text-xs font-semibold ${
    active ? "border-accent bg-accent/20 text-accent" : "border-border bg-surface text-slate-200"
  }`;
}

export function LocationSelector({ value, onChange }: { value: LocationValue; onChange: (v: LocationValue) => void }) {
  const [mode, setMode] = useState<Mode | null>(value.locationSource);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [nearbyBounds, setNearbyBounds] = useState<[number, number][]>([]);

  const municipalityOptions = COLOMBIA_LOCATIONS.find((d) => d.name === value.departmentName)?.municipalities ?? [];
  // GPS y "buscar lugar" comparten el mismo catálogo progresivo — GPS solo
  // resuelve el pin automáticamente, nunca el texto administrativo (no hay
  // reverse-geocoding), así que igual conviene ofrecer el catálogo en vez
  // de forzar texto libre.
  const showCatalogSelects = mode === "catalog" || mode === "gps";

  function patch(partial: Partial<LocationValue>) {
    onChange({ ...value, ...partial });
  }

  function chooseMode(next: Mode) {
    setMode(next);
    setGeoError(null);
    patch({ locationSource: next });
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setGeoError("Tu navegador no soporta geolocalización.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        patch({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        setGeoError("No se pudo obtener tu ubicación. Puedes seguir con otro modo.");
      }
    );
  }

  // "Buscar lugar": al completar depto+municipio, centra el mapa embebido
  // sobre reportes existentes ahí (si hay) para ayudar a ubicar el punto.
  useEffect(() => {
    if (mode !== "catalog" || !value.departmentName || !value.municipalityName) {
      setNearbyBounds([]);
      return;
    }
    let cancelled = false;
    api
      .getReports({ departmentName: value.departmentName, municipalityName: value.municipalityName, pageSize: 20 })
      .then((res) => {
        if (!cancelled) setNearbyBounds(res.reports.map((r) => [r.lat, r.lng] as [number, number]));
      })
      .catch(() => {
        if (!cancelled) setNearbyBounds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, value.departmentName, value.municipalityName]);

  const pin: [number, number] | null = value.lat != null && value.lng != null ? [value.lat, value.lng] : null;

  return (
    <div>
      <p className="text-xs font-semibold text-slate-400">¿Dónde estás o dónde está la ayuda?</p>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        <button
          type="button"
          onClick={() => {
            chooseMode("gps");
            useMyLocation();
          }}
          className={modeButtonClass(mode === "gps")}
        >
          📍 Usar mi ubicación
        </button>
        <button type="button" onClick={() => chooseMode("catalog")} className={modeButtonClass(mode === "catalog")}>
          🔎 Buscar lugar
        </button>
        <button type="button" onClick={() => chooseMode("manual")} className={modeButtonClass(mode === "manual")}>
          ✏️ Escribir ubicación
        </button>
      </div>

      {mode === "gps" && (
        <p className="mt-2 text-xs text-slate-400">
          {locating
            ? "Obteniendo tu ubicación…"
            : value.lat != null
              ? "Ubicación detectada — toca el mapa si necesitas ajustar el punto."
              : "Si no autorizaste el permiso, toca el botón de nuevo o usa otro modo."}
        </p>
      )}
      {geoError && <p className="mt-2 text-xs text-danger">{geoError}</p>}

      {showCatalogSelects && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <select
            value={value.departmentName}
            onChange={(e) => patch({ departmentName: e.target.value, municipalityName: "" })}
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
          >
            <option value="">Departamento…</option>
            {COLOMBIA_LOCATIONS.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            value={value.municipalityName}
            onChange={(e) => patch({ municipalityName: e.target.value })}
            disabled={!value.departmentName}
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm disabled:opacity-50"
          >
            <option value="">Municipio…</option>
            {municipalityOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      )}

      {mode === "manual" && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={value.departmentName}
            onChange={(e) => patch({ departmentName: e.target.value })}
            placeholder="Departamento"
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
          />
          <input
            value={value.municipalityName}
            onChange={(e) => patch({ municipalityName: e.target.value })}
            placeholder="Municipio"
            className="h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
          />
        </div>
      )}

      {mode && (
        <input
          value={value.localityName}
          onChange={(e) => patch({ localityName: e.target.value })}
          placeholder="Vereda, corregimiento o barrio (opcional)"
          className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
        />
      )}

      {mode && (
        <>
          <p className="mt-3 text-xs font-semibold text-slate-400">
            {pin ? "Toca el mapa para ajustar el punto exacto." : "Toca el mapa para marcar el punto exacto."}
          </p>
          <div className="mt-1 h-[220px] w-full overflow-hidden rounded-xl border border-border">
            <MapContainer center={COLOMBIA_CENTER} zoom={COLOMBIA_ZOOM} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <MapController bounds={nearbyBounds} pin={pin} />
              <ClickToPlace onPick={(lat, lng) => patch({ lat, lng })} />
              {pin && (
                <CircleMarker center={pin} radius={9} pathOptions={{ color: "#3b6fe0", fillColor: "#3b6fe0", fillOpacity: 0.9 }} />
              )}
            </MapContainer>
          </div>
        </>
      )}

      <input
        value={value.approxLocationText}
        onChange={(e) => patch({ approxLocationText: e.target.value })}
        placeholder="Punto de referencia (opcional) — ej. cerca al puente verde"
        className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
      />
    </div>
  );
}
