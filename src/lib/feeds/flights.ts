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

type Adsb = { ac?: AdsbAc[]; aircraft?: AdsbAc[] };

const HUBS = [
  [40.64, -73.78],
  [33.94, -118.41],
  [51.47, -0.45],
  [35.55, 139.78],
  [25.25, 55.36],
  [1.36, 103.99],
  [50.03, 8.57],
  [-33.95, 151.18],
] as const;

const ADSB_BASES = [
  "https://opendata.adsb.fi/api/v2",
  "https://api.adsb.lol/v2",
];

let skyToken: { value: string; exp: number } | null = null;

function aircraftList(data: Adsb | null | undefined): AdsbAc[] {
  if (!data) return [];
  return data.ac ?? data.aircraft ?? [];
}

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
  const alt = ac.alt_baro === "ground" ? 0 : Number(ac.alt_geom ?? ac.alt_baro ?? 0);
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
    military: military || Boolean(ac.dbFlags && ac.dbFlags & 1),
    ts: Date.now(),
  };
}

async function openskyAuthHeader(): Promise<Record<string, string>> {
  const id = process.env.OPENSKY_CLIENT_ID?.trim();
  const secret = process.env.OPENSKY_CLIENT_SECRET?.trim();
  if (!id || !secret) return {};
  if (skyToken && Date.now() < skyToken.exp - 20_000) {
    return { Authorization: `Bearer ${skyToken.value}` };
  }
  const res = await fetch(
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: id,
        client_secret: secret,
      }),
    },
  );
  if (!res.ok) throw new Error(`OpenSky auth ${res.status}`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("OpenSky token missing");
  skyToken = {
    value: json.access_token,
    exp: Date.now() + Math.max(60, json.expires_in ?? 1800) * 1000,
  };
  return { Authorization: `Bearer ${skyToken.value}` };
}

async function pullOpenSky(): Promise<FlightSample[]> {
  const headers = await openskyAuthHeader().catch(() => ({} as Record<string, string>));
  const data = await fetchJson<OpenSky>("https://opensky-network.org/api/states/all", {
    timeoutMs: 9_000,
    headers,
  });
  const out: FlightSample[] = [];
  for (const row of data.states ?? []) {
    const f = fromOpenSky(row);
    if (f) out.push(f);
  }
  return out;
}

async function pullAdsbPoint(base: string, lat: number, lon: number, dist: number): Promise<FlightSample[]> {
  const data = await fetchJson<Adsb>(`${base}/lat/${lat}/lon/${lon}/dist/${dist}`, {
    timeoutMs: 7_000,
  });
  const out: FlightSample[] = [];
  for (const ac of aircraftList(data)) {
    const f = fromAdsb(ac, false);
    if (f) out.push(f);
  }
  return out;
}

async function pullAdsbHubs(): Promise<{ flights: FlightSample[]; source: string }> {
  const map = new Map<string, FlightSample>();
  let source = "adsb.fi";
  for (const base of ADSB_BASES) {
    const chunk = HUBS.slice(0, base.includes("adsb.fi") ? 6 : 4);
    const results = await Promise.allSettled(
      chunk.map(([lat, lon]) => pullAdsbPoint(base, lat, lon, 320)),
    );
    for (const r of results) {
      if (r.status !== "fulfilled") continue;
      for (const f of r.value) map.set(f.id, f);
    }
    if (map.size > 40) {
      source = base.includes("adsb.fi") ? "adsb.fi open data" : "adsb.lol";
      break;
    }
  }
  if (map.size === 0) throw new Error("ADS-B hubs empty");
  return { flights: [...map.values()], source };
}

async function pullMil(): Promise<{ flights: FlightSample[]; source: string }> {
  const errors: string[] = [];
  for (const base of ADSB_BASES) {
    try {
      const data = await fetchJson<Adsb>(`${base}/mil`, { timeoutMs: 8_000 });
      const out: FlightSample[] = [];
      for (const ac of aircraftList(data)) {
        const f = fromAdsb(ac, true);
        if (f) out.push(f);
      }
      if (out.length) {
        return {
          flights: out,
          source: base.includes("adsb.fi") ? "adsb.fi military" : "adsb.lol military",
        };
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : "mil failed");
    }
  }
  throw new Error(errors[0] || "Military ADS-B empty");
}

function capFlights(flights: FlightSample[]): FlightSample[] {
  if (flights.length <= 900) return flights;
  const air = flights.filter((f) => !f.onGround);
  const pool = air.length > 400 ? air : flights;
  if (pool.length <= 900) return pool;
  const step = pool.length / 900;
  const sampled: FlightSample[] = [];
  for (let i = 0; i < 900; i++) sampled.push(pool[Math.floor(i * step)]!);
  return sampled;
}

export const getFlights = createServerFn({ method: "GET" }).handler(async () => {
  return cached("flights", 16_000, async () => {
    try {
      const flights = capFlights(await pullOpenSky());
      if (flights.length > 20) {
        return {
          flights,
          source: process.env.OPENSKY_CLIENT_ID ? "OpenSky (signed in)" : "OpenSky Network",
          at: Date.now(),
          freshness: "live" as const,
        };
      }
    } catch {
      /* regional ADS-B next */
    }
    try {
      const { flights, source } = await pullAdsbHubs();
      return {
        flights: capFlights(flights),
        source,
        at: Date.now(),
        freshness: "live" as const,
      };
    } catch {
      const prev = stale<{ flights: FlightSample[]; source: string; at: number }>("flights");
      if (prev?.flights.length) {
        return { ...prev, freshness: "delayed" as const };
      }
      throw new Error("Flight feeds unavailable");
    }
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
    const { flights, source } = await pullMil();
    return {
      flights: capFlights(flights),
      source,
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

export const getFeedKeys = createServerFn({ method: "GET" }).handler(async () => {
  return {
    opensky: Boolean(process.env.OPENSKY_CLIENT_ID?.trim() && process.env.OPENSKY_CLIENT_SECRET?.trim()),
    ais: Boolean(process.env.AISSTREAM_API_KEY?.trim()),
    firms: Boolean(process.env.NASA_FIRMS_KEY?.trim()),
  };
});
