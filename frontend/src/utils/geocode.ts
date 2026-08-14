// Geocodificación con OpenStreetMap Nominatim — gratis, sin llave. Solo se
// llama desde acciones puntuales del usuario (elegir municipio, tocar el
// mapa, usar GPS), nunca en cada tecla, así que no hace falta debounce para
// respetar el límite de 1 req/seg de su política de uso.
const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";

export async function forwardGeocode(query: string): Promise<[number, number] | null> {
  try {
    const url = `${NOMINATIM_BASE}/search?format=json&limit=1&countrycodes=co&q=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const results: { lat: string; lon: string }[] = await res.json();
    if (!results[0]) return null;
    return [Number(results[0].lat), Number(results[0].lon)];
  } catch {
    return null;
  }
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `${NOMINATIM_BASE}/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=0`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const result: { display_name?: string } = await res.json();
    return result.display_name ?? null;
  } catch {
    return null;
  }
}
