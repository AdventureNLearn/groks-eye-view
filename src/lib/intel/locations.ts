export type Preset = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  height: number;
  kind: "city" | "airport" | "port" | "orbit" | "region";
};

export const PRESETS: Preset[] = [
  { id: "globe", name: "Full globe", lat: 18, lon: -32, height: 22_000_000, kind: "orbit" },
  { id: "iss", name: "ISS", lat: 0, lon: 0, height: 2_000_000, kind: "orbit" },
  { id: "nyc", name: "New York", lat: 40.64, lon: -73.78, height: 80_000, kind: "city" },
  { id: "austin", name: "Austin", lat: 30.2672, lon: -97.7431, height: 18_000, kind: "city" },
  { id: "lax", name: "LAX", lat: 33.9416, lon: -118.4085, height: 8_000, kind: "airport" },
  { id: "jfk", name: "JFK", lat: 40.6413, lon: -73.7781, height: 8_000, kind: "airport" },
  { id: "lhr", name: "Heathrow", lat: 51.47, lon: -0.4543, height: 8_000, kind: "airport" },
  { id: "nrt", name: "Tokyo", lat: 35.772, lon: 140.3929, height: 14_000, kind: "city" },
  { id: "hnd", name: "Haneda", lat: 35.5494, lon: 139.7798, height: 6_000, kind: "airport" },
  { id: "sfo", name: "San Francisco", lat: 37.7749, lon: -122.4194, height: 12_000, kind: "city" },
  { id: "lbg", name: "Long Beach", lat: 33.754, lon: -118.216, height: 6_000, kind: "port" },
  { id: "rotterdam", name: "Rotterdam", lat: 51.95, lon: 4.14, height: 8_000, kind: "port" },
  { id: "singapore", name: "Singapore", lat: 1.3644, lon: 103.9915, height: 10_000, kind: "city" },
  { id: "dubai", name: "Dubai", lat: 25.2532, lon: 55.3657, height: 10_000, kind: "city" },
  { id: "sydney", name: "Sydney", lat: -33.9399, lon: 151.1753, height: 10_000, kind: "city" },
  { id: "london", name: "London", lat: 51.5074, lon: -0.1278, height: 14_000, kind: "city" },
  { id: "ksc", name: "Kennedy Space Center", lat: 28.5721, lon: -80.648, height: 20_000, kind: "region" },
  { id: "vandenberg", name: "Vandenberg", lat: 34.742, lon: -120.5724, height: 16_000, kind: "region" },
  { id: "baikonur", name: "Baikonur", lat: 45.965, lon: 63.305, height: 30_000, kind: "region" },
  { id: "gibraltar", name: "Gibraltar", lat: 36.14, lon: -5.35, height: 12_000, kind: "region" },
  { id: "suez", name: "Suez", lat: 30.0, lon: 32.55, height: 40_000, kind: "region" },
  { id: "malacca", name: "Malacca Strait", lat: 2.5, lon: 101.7, height: 80_000, kind: "region" },
  { id: "california", name: "California", lat: 36.7, lon: -119.4, height: 900_000, kind: "region" },
  { id: "ukraine", name: "Eastern Europe", lat: 49.0, lon: 31.0, height: 1_200_000, kind: "region" },
];

export const AIRPORT_INDEX: Record<string, Preset> = Object.fromEntries(
  [
    ["lax", PRESETS.find((p) => p.id === "lax")!],
    ["jfk", PRESETS.find((p) => p.id === "jfk")!],
    ["lhr", PRESETS.find((p) => p.id === "lhr")!],
    ["heathrow", PRESETS.find((p) => p.id === "lhr")!],
    ["nrt", PRESETS.find((p) => p.id === "nrt")!],
    ["hnd", PRESETS.find((p) => p.id === "hnd")!],
    ["sfo", PRESETS.find((p) => p.id === "sfo")!],
    ["dxb", PRESETS.find((p) => p.id === "dubai")!],
    ["syd", PRESETS.find((p) => p.id === "sydney")!],
    ["sin", PRESETS.find((p) => p.id === "singapore")!],
    ["aus", PRESETS.find((p) => p.id === "austin")!],
    ["nyc", PRESETS.find((p) => p.id === "nyc")!],
    ["new york", PRESETS.find((p) => p.id === "nyc")!],
  ].map(([k, v]) => [k, v]),
);

export function matchPreset(q: string): Preset | null {
  const n = q.trim().toLowerCase();
  if (!n) return null;
  if (AIRPORT_INDEX[n]) return AIRPORT_INDEX[n];
  return (
    PRESETS.find(
      (p) => p.name.toLowerCase() === n || p.id === n || p.name.toLowerCase().includes(n),
    ) ?? null
  );
}
