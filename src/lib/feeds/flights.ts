import { createServerFn } from "@tanstack/react-start";
import { cached, fetchJson, stale } from "./http";
import type { FlightSample } from "@/lib/intel/types";

type OpenSky = {
  time?: number;
  states?: Array<Array<string | number | boolean | null>>;
};

type AdsbAc = {
  hex?: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | "ground";
  alt_geom?: number;
  track?: number;
  gs?: number;
  baro_rate?: number;
  r?: string;
  t?: string;
  dbFlags?: number;
};

type Adsb = { ac?: AdsbAc[] };

const HUBS = [
  [40.64, -73.78],
  [33.94, -118.41],
  [51.47, -0.45],
  [35.55, 139.78],
  [25.25, 55.36],
  [1.36, 103.99],
  [50.03, 8.57],
  [-33.95, 151.18],
  [41.98, -87.9],
  [19.09, 72.87],
] as const;

function fromOpenSky(row: Array<string | number | boolean | null>): FlightSample | null {
  const lat = Number(row[6]);
  const lon = Number(row[5]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const call = String(row[1] ?? "").trim() || String(row[0] ?? "UNKN");
  const alt = Number(row[13] ?? row[7] ?? 0);
  return {
    id: String(row[0] ?? call),
    callsign: call,
    origin: String(row[2] ?? ""),
    lat,
    lon,
    altM: Number.isFinite(alt) ? alt : 0,
    heading: Number(row[10] ?? 0) || 0,
    speedMs: Number(row[9] ?? 0) || 0,
    vertMs: Number(row[11] ?? 0) || 0,
    onGround: Boolean(row[8]),
    military: false,
    ts: Number(row[4] ?? Date.now() / 1000) * 1000,
  };
}

function fromAdsb(ac: AdsbAc, military: boolean): FlightSample | null {
  if (ac.lat == null || ac.lon == null) return null;
  const alt =
    ac.alt_baro === "ground" ? 0 : Number(ac.alt_geom ?? ac.alt_baro ?? 0);
  const altM = Number.isFinite(alt) ? alt * 0.3048 : 0;
  return {
    id: String(ac.hex ?? ac.flight ?? Math.random()),
    callsign: String(ac.flight ?? ac.r ?? ac.hex ?? "UNKN").trim(),
    origin: String(ac.t ?? ""),
    lat: ac.lat,
    lon: ac.lon,
    altM,
    heading: Number(ac.track ?? 0) || 0,
    speedMs: (Number(ac.gs ?? 0) || 0) * 0.514444,
    vertMs: (Number(ac.baro_rate ?? 0) || 0) * 0.00508,
    onGround: ac.alt_baro === "ground" || altM < 20,
    military,
    ts: Date.now(),
  };
}

async function pullOpenSky(): Promise<FlightSample[]> {
  const data = await fetchJson<OpenSky>("https://opensky-network.org/api/states/all", {
    timeoutMs: 10_000,
  });
  const rows = data.states ?? [];
  const out: FlightSample[] = [];
  for (const row of rows) {
    const f = fromOpenSky(row);
    if (f) out.push(f);
  }
  return out;
}

async function pullAdsbHubs(): Promise<FlightSample[]> {
  const results = await Promise.allSettled(
    HUBS.map(([lat, lon]) =>
      fetchJson<Adsb>(`https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/250`, {
        timeoutMs: 8000,
      }),
    ),
  );
  const map = new Map<string, FlightSample>();
  for (const r of results) {
    if (r.status !== "fulfilled") continue;
    for (const ac of r.value.ac ?? []) {
      const f = fromAdsb(ac, false);
      if (f) map.set(f.id, f);
    }
  }
  return [...map.values()];
}

async function pullMil(): Promise<FlightSample[]> {
  try {
    const data = await fetchJson<Adsb>("https://api.adsb.lol/v2/mil", { timeoutMs: 8000 });
    const out: FlightSample[] = [];
    for (const ac of data.ac ?? []) {
      const f = fromAdsb(ac, true);
      if (f) out.push(f);
    }
    return out;
  } catch {
    return [];
  }
}

export const getFlights = createServerFn({ method: "GET" }).handler(async () => {
  return cached("flights", 18_000, async () => {
    let flights: FlightSample[] = [];
    let source = "OpenSky Network";
    try {
      flights = await pullOpenSky();
    } catch {
      try {
        flights = await pullAdsbHubs();
        source = "adsb.lol (regional fallback)";
      } catch {
        const prev = stale<{ flights: FlightSample[]; source: string; at: number }>("flights");
        if (prev) {
          return { ...prev, freshness: "delayed" as const };
        }
        throw new Error("Flight feeds unavailable");
      }
    }
    if (flights.length > 900) {
      const air = flights.filter((f) => !f.onGround);
      const pool = air.length > 400 ? air : flights;
      if (pool.length > 900) {
        const step = pool.length / 900;
        const sampled: FlightSample[] = [];
        for (let i = 0; i < 900; i++) sampled.push(pool[Math.floor(i * step)]!);
        flights = sampled;
      } else {
        flights = pool;
      }
    }
    return { flights, source, at: Date.now(), freshness: "live" as const };
  }).catch((err: unknown) => ({
    flights: [] as FlightSample[],
    source: "unavailable",
    at: Date.now(),
    freshness: "error" as const,
    error: err instanceof Error ? err.message : "Flight feed failed",
  }));
});

export const getMilitary = createServerFn({ method: "GET" }).handler(async () => {
  return cached("military", 20_000, async () => {
    const flights = await pullMil();
    return {
      flights,
      source: "adsb.lol military",
      at: Date.now(),
      freshness: "live" as const,
    };
  }).catch((err: unknown) => ({
    flights: [] as FlightSample[],
    source: "unavailable",
    at: Date.now(),
    freshness: "error" as const,
    error: err instanceof Error ? err.message : "Military feed failed",
  }));
});
