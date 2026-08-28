import { createServerFn } from "@tanstack/react-start";
import { cached, fetchJson } from "./http";
import type {
  FireSample,
  LaunchSample,
  QuakeSample,
  SatCatalogItem,
  SatOmm,
  VoiceAction,
} from "@/lib/intel/types";

type CelestrakSat = {
  OBJECT_NAME?: string;
  OBJECT_ID?: string;
  NORAD_CAT_ID?: number | string;
  EPOCH?: string;
  MEAN_MOTION?: number;
  ECCENTRICITY?: number;
  INCLINATION?: number;
  RA_OF_ASC_NODE?: number;
  ARG_OF_PERICENTER?: number;
  MEAN_ANOMALY?: number;
  BSTAR?: number;
  MEAN_MOTION_DOT?: number;
  MEAN_MOTION_DDOT?: number;
  EPHEMERIS_TYPE?: number;
  CLASSIFICATION_TYPE?: string;
  ELEMENT_SET_NO?: number;
  REV_AT_EPOCH?: number;
};

function asOmm(row: CelestrakSat): SatOmm {
  return {
    OBJECT_NAME: String(row.OBJECT_NAME ?? "SAT"),
    OBJECT_ID: String(row.OBJECT_ID ?? row.NORAD_CAT_ID ?? ""),
    NORAD_CAT_ID: Number(row.NORAD_CAT_ID ?? 0),
    EPOCH: String(row.EPOCH ?? ""),
    MEAN_MOTION: Number(row.MEAN_MOTION ?? 0),
    ECCENTRICITY: Number(row.ECCENTRICITY ?? 0),
    INCLINATION: Number(row.INCLINATION ?? 0),
    RA_OF_ASC_NODE: Number(row.RA_OF_ASC_NODE ?? 0),
    ARG_OF_PERICENTER: Number(row.ARG_OF_PERICENTER ?? 0),
    MEAN_ANOMALY: Number(row.MEAN_ANOMALY ?? 0),
    BSTAR: Number(row.BSTAR ?? 0),
    MEAN_MOTION_DOT: Number(row.MEAN_MOTION_DOT ?? 0),
    MEAN_MOTION_DDOT: Number(row.MEAN_MOTION_DDOT ?? 0),
    EPHEMERIS_TYPE: Number(row.EPHEMERIS_TYPE ?? 0),
    CLASSIFICATION_TYPE: String(row.CLASSIFICATION_TYPE ?? "U"),
    ELEMENT_SET_NO: Number(row.ELEMENT_SET_NO ?? 0),
    REV_AT_EPOCH: Number(row.REV_AT_EPOCH ?? 0),
  };
}

async function fetchGroup(group: string): Promise<SatCatalogItem[]> {
  const urls = [
    `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=json`,
    `https://celestrak.com/NORAD/elements/gp.php?GROUP=${group}&FORMAT=json`,
  ];
  let last: unknown;
  for (const url of urls) {
    try {
      const rows = await fetchJson<CelestrakSat[]>(url, { timeoutMs: 16_000 });
      return (rows ?? []).slice(0, group === "visual" ? 220 : 80).map((row) => {
        const rec = asOmm(row);
        return {
          id: String(rec.NORAD_CAT_ID || rec.OBJECT_ID || rec.OBJECT_NAME),
          name: rec.OBJECT_NAME,
          norad: rec.NORAD_CAT_ID,
          group,
          rec,
        };
      });
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("CelesTrak unreachable");
}

export const getSatellites = createServerFn({ method: "GET" }).handler(async () => {
  return cached("sats", 6 * 60 * 60 * 1000, async () => {
    const [stations, visual] = await Promise.all([
      fetchGroup("stations"),
      fetchGroup("visual"),
    ]);
    const seen = new Set<string>();
    const items: SatCatalogItem[] = [];
    for (const s of [...stations, ...visual]) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      items.push(s);
    }
    return { items, source: "CelesTrak", at: Date.now(), freshness: "live" as const };
  }).catch((err: unknown) => ({
    items: [] as SatCatalogItem[],
    source: "unavailable",
    at: Date.now(),
    freshness: "error" as const,
    error: err instanceof Error ? err.message : "Satellite catalog failed",
  }));
});

type Usgs = {
  features?: Array<{
    id: string;
    properties?: { mag?: number; place?: string; time?: number; url?: string };
    geometry?: { coordinates?: number[] };
  }>;
};

export const getEarthquakes = createServerFn({ method: "GET" }).handler(async () => {
  return cached("quakes", 120_000, async () => {
    const data = await fetchJson<Usgs>(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson",
    );
    const items: QuakeSample[] = [];
    for (const f of data.features ?? []) {
      const c = f.geometry?.coordinates ?? [];
      const lon = Number(c[0]);
      const lat = Number(c[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      items.push({
        id: f.id,
        title: f.properties?.place ?? "Earthquake",
        mag: Number(f.properties?.mag ?? 0),
        lat,
        lon,
        depthKm: Number(c[2] ?? 0),
        ts: Number(f.properties?.time ?? Date.now()),
        url: f.properties?.url ?? "",
      });
    }
    return { items, source: "USGS", at: Date.now(), freshness: "live" as const };
  }).catch((err: unknown) => ({
    items: [] as QuakeSample[],
    source: "unavailable",
    at: Date.now(),
    freshness: "error" as const,
    error: err instanceof Error ? err.message : "USGS feed failed",
  }));
});

type Eonet = {
  events?: Array<{
    id: string;
    title?: string;
    geometry?: Array<{ coordinates?: number[] | number[][]; type?: string }>;
    sources?: Array<{ id?: string }>;
  }>;
};

export const getFires = createServerFn({ method: "GET" }).handler(async () => {
  return cached("fires", 300_000, async () => {
    const firmsKey = process.env.NASA_FIRMS_KEY?.trim();
    if (firmsKey) {
      try {
        const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${firmsKey}/VIIRS_NOAA20_NRT/world/1`;
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12_000);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) {
          const text = await res.text();
          const lines = text.trim().split("\n");
          const header = lines.shift()?.split(",") ?? [];
          const iLat = header.indexOf("latitude");
          const iLon = header.indexOf("longitude");
          const iBright = header.indexOf("bright_ti4");
          const items: FireSample[] = [];
          for (const line of lines) {
            const cols = line.split(",");
            const lat = Number(cols[iLat]);
            const lon = Number(cols[iLon]);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
            items.push({
              id: `firms-${lon.toFixed(2)}-${lat.toFixed(2)}`,
              title: `Hotspot ${Number(cols[iBright] || 0).toFixed(0)}K`,
              lat,
              lon,
              source: "NASA FIRMS",
            });
            if (items.length >= 120) break;
          }
          if (items.length) {
            return { items, source: "NASA FIRMS VIIRS", at: Date.now(), freshness: "live" as const };
          }
        }
      } catch {
        /* fall through to EONET */
      }
    }
    const data = await fetchJson<Eonet>(
      "https://eonet.gsfc.nasa.gov/api/v3/events?category=wildfires&status=open&limit=80",
    );
    const items: FireSample[] = [];
    for (const ev of data.events ?? []) {
      const g = ev.geometry?.[ev.geometry.length - 1];
      const coords = g?.coordinates;
      if (!Array.isArray(coords) || typeof coords[0] !== "number") continue;
      const lon = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      items.push({
        id: ev.id,
        title: ev.title ?? "Wildfire",
        lat,
        lon,
        source: ev.sources?.[0]?.id ?? "EONET",
      });
    }
    return { items, source: "NASA EONET", at: Date.now(), freshness: "live" as const };
  }).catch((err: unknown) => ({
    items: [] as FireSample[],
    source: "unavailable",
    at: Date.now(),
    freshness: "error" as const,
    error: err instanceof Error ? err.message : "EONET feed failed",
  }));
});

type LL2 = {
  results?: Array<{
    id: string;
    name?: string;
    net?: string;
    status?: { name?: string };
    launch_service_provider?: { name?: string };
    pad?: {
      name?: string;
      latitude?: string | number;
      longitude?: string | number;
      location?: { name?: string };
    };
  }>;
};

export const getLaunches = createServerFn({ method: "GET" }).handler(async () => {
  return cached("launches", 30 * 60 * 1000, async () => {
    const data = await fetchJson<LL2>(
      "https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=16&mode=list",
    );
    const items: LaunchSample[] = [];
    for (const r of data.results ?? []) {
      const lat = Number(r.pad?.latitude);
      const lon = Number(r.pad?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      items.push({
        id: r.id,
        name: r.name ?? "Launch",
        provider: r.launch_service_provider?.name ?? "Unknown",
        pad: r.pad?.name ?? r.pad?.location?.name ?? "Pad",
        lat,
        lon,
        net: r.net ?? "",
        status: r.status?.name ?? "",
      });
    }
    return { items, source: "Launch Library 2", at: Date.now(), freshness: "live" as const };
  }).catch((err: unknown) => ({
    items: [] as LaunchSample[],
    source: "unavailable",
    at: Date.now(),
    freshness: "error" as const,
    error: err instanceof Error ? err.message : "Launch feed failed",
  }));
});

type IssNow = {
  latitude?: number;
  longitude?: number;
  altitude?: number;
  velocity?: number;
  name?: string;
};

export const getIss = createServerFn({ method: "GET" }).handler(async () => {
  return cached("iss", 12_000, async () => {
    const d = await fetchJson<IssNow>("https://api.wheretheiss.at/v1/satellites/25544", {
      timeoutMs: 8000,
    });
    const lat = Number(d.latitude);
    const lon = Number(d.longitude);
    const altKm = Number(d.altitude);
    const velKmh = Number(d.velocity);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("ISS payload");
    return {
      lat,
      lon,
      altM: Number.isFinite(altKm) ? altKm * 1000 : 420_000,
      speedMs: Number.isFinite(velKmh) ? (velKmh * 1000) / 3600 : 7660,
      source: "Where The ISS At",
      at: Date.now(),
    };
  }).catch(() => null);
});

type Meteo = {
  current?: {
    temperature_2m?: number;
    wind_speed_10m?: number;
    weather_code?: number;
  };
};

const WX: Record<number, string> = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Drizzle",
  61: "Rain",
  71: "Snow",
  80: "Showers",
  95: "Thunderstorm",
};

export const getWeather = createServerFn({ method: "POST" })
  .validator((input: { lat: number; lon: number }) => input)
  .handler(async ({ data }) => {
    const key = `wx:${data.lat.toFixed(1)},${data.lon.toFixed(1)}`;
    return cached(key, 10 * 60 * 1000, async () => {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${data.lat}&longitude=${data.lon}` +
        `&current=temperature_2m,wind_speed_10m,weather_code&wind_speed_unit=kn&temperature_unit=celsius`;
      const d = await fetchJson<Meteo>(url, { timeoutMs: 8000 });
      const code = Number(d.current?.weather_code ?? 0);
      return {
        temp: `${Math.round(Number(d.current?.temperature_2m ?? 0))}°C`,
        wind: `${Math.round(Number(d.current?.wind_speed_10m ?? 0))} kn`,
        sky: WX[code] ?? "Observed",
      };
    });
  });

type NominatimHit = {
  display_name?: string;
  lat?: string;
  lon?: string;
  type?: string;
};

export const geocodePlace = createServerFn({ method: "POST" })
  .validator((input: { q: string }) => input)
  .handler(async ({ data }) => {
    const q = data.q.trim();
    if (!q) return { results: [] as Array<{ name: string; lat: number; lon: number }> };
    return cached(`geo:${q.toLowerCase()}`, 24 * 60 * 60 * 1000, async () => {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`;
      const hits = await fetchJson<NominatimHit[]>(url, { timeoutMs: 8000 });
      return {
        results: (hits ?? [])
          .map((h) => ({
            name: h.display_name ?? q,
            lat: Number(h.lat),
            lon: Number(h.lon),
          }))
          .filter((h) => Number.isFinite(h.lat) && Number.isFinite(h.lon)),
      };
    });
  });

function asVoiceAction(raw: unknown): VoiceAction {
  if (!raw || typeof raw !== "object") return { type: "unknown" };
  const o = raw as {
    type?: unknown;
    q?: unknown;
    kind?: unknown;
    on?: unknown;
    style?: unknown;
    id?: unknown;
  };
  const action: VoiceAction = { type: typeof o.type === "string" ? o.type : "unknown" };
  if (typeof o.q === "string") action.q = o.q;
  if (typeof o.kind === "string") action.kind = o.kind;
  if (typeof o.on === "boolean") action.on = o.on;
  if (typeof o.style === "string") action.style = o.style;
  if (typeof o.id === "string") action.id = o.id;
  return action;
}

export const interpretCommand = createServerFn({ method: "POST" })
  .validator((input: { text: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true; action: VoiceAction } | { ok: false; error: string }> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "unavailable" };
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 220,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Map a globe operator utterance to ONE JSON object. Keys: type (flyTo|trackNearest|cockpit|style|layer|reset|hud|detection|count|scene|next|radio|unknown), plus fields q, kind (flight|vessel|satellite|iss), on (bool), style (normal|crt|nvg|flir|noir|snow), id (layer id, scene id, or radio station id such as ccr, skynyrd, floyd, zeppelin, cash, seventies, next, prev). Radio: play CCR/creedence => type radio id ccr on true. Play zeppelin => id zeppelin. No markdown.",
          },
          { role: "user", content: data.text.slice(0, 240) },
        ],
      }),
    });
    if (!res.ok) return { ok: false, error: `xAI ${res.status}` };
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = body.choices?.[0]?.message?.content ?? "";
    try {
      const json: unknown = JSON.parse(text.replace(/```json|```/g, "").trim());
      return { ok: true, action: asVoiceAction(json) };
    } catch {
      return { ok: false, error: "parse" };
    }
  });
