import { bearingDeg, interpolateGreatCircle } from "./geo";
import type { FlightSample } from "./types";

type Corridor = {
  a: string;
  b: string;
  from: [number, number];
  to: [number, number];
  count: number;
  kts: number;
  cruiseM: number;
};

const CORRIDORS: Corridor[] = [
  { a: "JFK", b: "LHR", from: [40.64, -73.78], to: [51.47, -0.45], count: 8, kts: 480, cruiseM: 11_000 },
  { a: "JFK", b: "LAX", from: [40.64, -73.78], to: [33.94, -118.41], count: 10, kts: 460, cruiseM: 10_600 },
  { a: "JFK", b: "MIA", from: [40.64, -73.78], to: [25.8, -80.29], count: 6, kts: 420, cruiseM: 9_400 },
  { a: "LAX", b: "NRT", from: [33.94, -118.41], to: [35.77, 140.39], count: 8, kts: 490, cruiseM: 11_200 },
  { a: "SFO", b: "JFK", from: [37.62, -122.38], to: [40.64, -73.78], count: 7, kts: 470, cruiseM: 10_800 },
  { a: "LHR", b: "SIN", from: [51.47, -0.45], to: [1.36, 103.99], count: 6, kts: 500, cruiseM: 11_400 },
  { a: "DXB", b: "LHR", from: [25.25, 55.36], to: [51.47, -0.45], count: 6, kts: 490, cruiseM: 11_000 },
  { a: "DXB", b: "JFK", from: [25.25, 55.36], to: [40.64, -73.78], count: 5, kts: 500, cruiseM: 11_200 },
  { a: "SIN", b: "SYD", from: [1.36, 103.99], to: [-33.95, 151.18], count: 5, kts: 460, cruiseM: 10_400 },
  { a: "SYD", b: "LAX", from: [-33.95, 151.18], to: [33.94, -118.41], count: 6, kts: 500, cruiseM: 11_300 },
  { a: "FRA", b: "JFK", from: [50.03, 8.57], to: [40.64, -73.78], count: 5, kts: 470, cruiseM: 10_700 },
  { a: "ORD", b: "LHR", from: [41.98, -87.9], to: [51.47, -0.45], count: 5, kts: 460, cruiseM: 10_500 },
  { a: "ATL", b: "CDG", from: [33.64, -84.43], to: [49.01, 2.55], count: 4, kts: 470, cruiseM: 10_600 },
  { a: "GRU", b: "JFK", from: [-23.43, -46.47], to: [40.64, -73.78], count: 4, kts: 480, cruiseM: 10_800 },
  { a: "HKG", b: "SFO", from: [22.31, 113.91], to: [37.62, -122.38], count: 5, kts: 500, cruiseM: 11_400 },
  { a: "ICN", b: "LAX", from: [37.46, 126.44], to: [33.94, -118.41], count: 5, kts: 490, cruiseM: 11_100 },
  { a: "AMS", b: "JFK", from: [52.31, 4.76], to: [40.64, -73.78], count: 4, kts: 460, cruiseM: 10_400 },
  { a: "DOH", b: "LHR", from: [25.27, 51.61], to: [51.47, -0.45], count: 4, kts: 480, cruiseM: 10_900 },
  { a: "AUS", b: "LAX", from: [30.19, -97.67], to: [33.94, -118.41], count: 4, kts: 430, cruiseM: 9_800 },
  { a: "AUS", b: "JFK", from: [30.19, -97.67], to: [40.64, -73.78], count: 4, kts: 440, cruiseM: 10_000 },
];

const CALL = ["UAL", "AAL", "DAL", "BAW", "AFR", "DLH", "SIA", "QTR", "UAE", "ANA", "JAL", "QFA", "CPA", "KLM", "SWA"];

export function simulatedFlights(now = Date.now()): FlightSample[] {
  const out: FlightSample[] = [];
  let n = 0;
  for (const c of CORRIDORS) {
    const dist = Math.hypot(c.to[0] - c.from[0], c.to[1] - c.from[1]);
    const period = Math.max(3.2, dist * 18) * 60;
    for (let i = 0; i < c.count; i++) {
      const seed = n++;
      const t = ((now / 1000 / period + i / c.count) % 1 + 1) % 1;
      const pos = interpolateGreatCircle(c.from[0], c.from[1], c.to[0], c.to[1], t);
      const ahead = interpolateGreatCircle(
        c.from[0],
        c.from[1],
        c.to[0],
        c.to[1],
        Math.min(0.999, t + 0.004),
      );
      const heading = bearingDeg(pos.lat, pos.lon, ahead.lat, ahead.lon);
      const envelope = Math.sin(t * Math.PI);
      const altM = 180 + envelope * c.cruiseM;
      const call = `${CALL[seed % CALL.length]}${String(100 + seed).slice(-3)}`;
      out.push({
        id: `sim-${seed}`,
        callsign: call,
        origin: t < 0.5 ? c.a : c.b,
        lat: pos.lat,
        lon: pos.lon,
        altM,
        heading,
        speedMs: c.kts * 0.514444,
        vertMs: envelope > 0.92 ? -8 : envelope < 0.08 ? 8 : 0,
        onGround: envelope < 0.04,
        military: false,
        ts: now,
      });
    }
  }
  return out;
}
