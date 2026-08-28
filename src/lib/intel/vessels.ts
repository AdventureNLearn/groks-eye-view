import { bearingDeg, haversineM, interpolateGreatCircle } from "./geo";
import type { Contact } from "./types";

type Lane = {
  name: string;
  from: [number, number];
  to: [number, number];
  kts: number;
  count: number;
  prefix: string;
};

const LANES: Lane[] = [
  { name: "Shanghai–Los Angeles", from: [31.23, 121.47], to: [33.74, -118.27], kts: 18, count: 14, prefix: "COSCO" },
  { name: "Singapore–Rotterdam", from: [1.26, 103.82], to: [51.95, 4.14], kts: 16, count: 16, prefix: "MSC" },
  { name: "Rotterdam–New York", from: [51.95, 4.14], to: [40.68, -74.03], kts: 17, count: 10, prefix: "MAERSK" },
  { name: "Houston–Rotterdam", from: [29.73, -95.01], to: [51.95, 4.14], kts: 15, count: 8, prefix: "HAPAG" },
  { name: "Tokyo–Seattle", from: [35.44, 139.65], to: [47.58, -122.35], kts: 18, count: 8, prefix: "NYK" },
  { name: "Panama–Long Beach", from: [8.95, -79.57], to: [33.75, -118.22], kts: 16, count: 8, prefix: "EVERGREEN" },
  { name: "Cape Town–Singapore", from: [-33.91, 18.43], to: [1.26, 103.82], kts: 15, count: 8, prefix: "CMA" },
  { name: "Santos–Rotterdam", from: [-23.96, -46.3], to: [51.95, 4.14], kts: 14, count: 6, prefix: "GRIMALDI" },
  { name: "Busan–L.A.", from: [35.1, 129.04], to: [33.74, -118.27], kts: 19, count: 10, prefix: "HMM" },
  { name: "Malacca corridor", from: [5.4, 100.2], to: [1.1, 103.6], kts: 12, count: 12, prefix: "ASEAN" },
  { name: "Suez northbound", from: [29.9, 32.55], to: [31.5, 32.35], kts: 10, count: 8, prefix: "SUEZ" },
  { name: "Gibraltar eastbound", from: [35.9, -5.8], to: [36.2, -5.2], kts: 11, count: 6, prefix: "STRT" },
  { name: "Persian Gulf", from: [26.5, 50.6], to: [25.0, 55.0], kts: 13, count: 8, prefix: "GULF" },
  { name: "English Channel", from: [50.2, -1.5], to: [51.1, 1.5], kts: 14, count: 10, prefix: "CHAN" },
  { name: "Hong Kong–Sydney", from: [22.3, 114.18], to: [-33.85, 151.21], kts: 17, count: 6, prefix: "OOCL" },
];

const TYPES = ["Container", "Tanker", "Bulk", "RoRo", "Gas"];

export function simulatedVessels(now = Date.now()): Contact[] {
  const out: Contact[] = [];
  let n = 0;
  for (const lane of LANES) {
    const dist = haversineM(lane.from[0], lane.from[1], lane.to[0], lane.to[1]);
    const speedMs = lane.kts * 0.514444;
    const period = Math.max(dist / speedMs, 3600);
    for (let i = 0; i < lane.count; i++) {
      const seed = n++;
      const t = ((now / 1000 / period + i / lane.count) % 1 + 1) % 1;
      const pos = interpolateGreatCircle(lane.from[0], lane.from[1], lane.to[0], lane.to[1], t);
      const ahead = interpolateGreatCircle(
        lane.from[0],
        lane.from[1],
        lane.to[0],
        lane.to[1],
        Math.min(0.999, t + 0.002),
      );
      const heading = bearingDeg(pos.lat, pos.lon, ahead.lat, ahead.lon);
      const kind = TYPES[seed % TYPES.length];
      const name = `${lane.prefix} ${String(1000 + seed).slice(-4)}`;
      out.push({
        id: `ves-${seed}`,
        kind: "vessel",
        name,
        meta: `${kind} · ${lane.name}`,
        lat: pos.lat,
        lon: pos.lon,
        altM: 0,
        heading,
        speedMs,
        vertMs: 0,
        source: "Modeled shipping lanes",
        freshness: "simulated",
        extra: { route: lane.name, kts: lane.kts, class: kind },
      });
    }
  }
  return out;
}
