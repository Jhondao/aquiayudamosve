import { useEffect, useState } from "react";
import { CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { COLOMBIA_LOCATIONS } from "../data/colombiaLocations";
import { forwardGeocode, reverseGeocode } from "../utils/geocode";
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

function ClickToPlace({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

// Centra el mapa embebido: el pin (si existe) siempre gana. Sin pin, se
// centra sobre el municipio elegido (geocodificado en el componente padre);
// sin nada de eso, vista nacional.
function MapController({ focus, pin }: { focus: [number, number] | null; pin: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (pin) {
      map.setView(pin, Math.max(map.getZoom(), 14));
    } else if (focus) {
      map.setView(focus, 13);
    } else {
      map.setView(COLOMBIA_CENTER, COLOMBIA_ZOOM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, focus, map]);
  return null;
}

export function LocationSelector({ value, onChange }: { value: LocationValue; onChange: (v: LocationValue) => void }) {
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [focus, setFocus] = useState<[number, number] | null>(null);

  const municipalityOptions = COLOMBIA_LOCATIONS.find((d) => d.name === value.departmentName)?.municipalities ?? [];

  function patch(partial: Partial<LocationValue>) {
    onChange({ ...value, ...partial });
  }

  // En cuanto hay departamento+municipio y todavía no se puso el pin, se
  // busca el municipio en el mapa para acercar la vista ahí — así solo falta
  // un toque para ajustar el punto exacto, en vez de buscarlo a ojo en un
  // mapa del tamaño de Colombia entera.
  useEffect(() => {
    if (!value.departmentName || !value.municipalityName || value.lat != null) {
      setFocus(null);
      return;
    }
    let cancelled = false;
    forwardGeocode(`${value.municipalityName}, ${value.departmentName}, Colombia`).then((coords) => {
      if (!cancelled) setFocus(coords);
    });
    return () => {
      cancelled = true;
    };
  }, [value.departmentName, value.municipalityName, value.lat]);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setGeoError("Tu navegador no soporta geolocalización.");
      return;
    }
    setLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        patch({ lat: latitude, lng: longitude, locationSource: "gps" });
        reverseGeocode(latitude, longitude).then((address) => {
          if (address) patch({ lat: latitude, lng: longitude, locationSource: "gps", approxLocationText: address });
        });
      },
      () => {
        setLocating(false);
        setGeoError("No se pudo obtener tu ubicación. Elige el municipio y toca el mapa.");
      }
    );
  }

  function onMapPick(lat: number, lng: number) {
    patch({ lat, lng, locationSource: value.locationSource ?? "catalog" });
    reverseGeocode(lat, lng).then((address) => {
      if (address) patch({ approxLocationText: address });
    });
  }

  const pin: [number, number] | null = value.lat != null && value.lng != null ? [value.lat, value.lng] : null;

  return (
    <div>
      <p className="text-xs font-semibold text-slate-400">¿Dónde estás o dónde está la ayuda?</p>

      <button
        type="button"
        onClick={useMyLocation}
        disabled={locating}
        className="mt-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-50"
      >
        {locating ? "Obteniendo tu ubicación…" : "📍 Usar mi ubicación"}
      </button>
      {geoError && <p className="mt-2 text-xs text-danger">{geoError}</p>}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <select
          value={value.departmentName}
          onChange={(e) => patch({ departmentName: e.target.value, municipalityName: "", locationSource: "catalog" })}
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
          onChange={(e) => patch({ municipalityName: e.target.value, locationSource: "catalog" })}
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

      <input
        value={value.localityName}
        onChange={(e) => patch({ localityName: e.target.value })}
        placeholder="Vereda, corregimiento o barrio (opcional)"
        className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
      />

      <p className="mt-3 text-xs font-semibold text-slate-400">
        {pin ? "Toca el mapa para ajustar el punto exacto." : "Toca el mapa para marcar el punto exacto."}
      </p>
      <div className="mt-1 h-[220px] w-full overflow-hidden rounded-xl border border-border">
        <MapContainer center={COLOMBIA_CENTER} zoom={COLOMBIA_ZOOM} scrollWheelZoom style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapController focus={focus} pin={pin} />
          <ClickToPlace onPick={onMapPick} />
          {pin && <CircleMarker center={pin} radius={9} pathOptions={{ color: "#3b6fe0", fillColor: "#3b6fe0", fillOpacity: 0.9 }} />}
        </MapContainer>
      </div>

      <input
        value={value.approxLocationText}
        onChange={(e) => patch({ approxLocationText: e.target.value })}
        placeholder="Dirección o punto de referencia (se llena solo al tocar el mapa — puedes editarla)"
        className="mt-2 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm"
      />
    </div>
  );
}
