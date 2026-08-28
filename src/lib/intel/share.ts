import { LAYER_META, type LayerId, type StyleId } from "./types";
import { useIntel } from "./store";

const STYLES = new Set<StyleId>(["normal", "crt", "nvg", "flir", "noir", "snow"]);

export function buildShareUrl() {
  if (typeof window === "undefined") return "";
  const s = useIntel.getState();
  const params = new URLSearchParams();
  params.set("lat", s.cam.lat.toFixed(3));
  params.set("lon", s.cam.lon.toFixed(3));
  params.set("h", String(Math.round(s.cam.height)));
  if (s.style !== "normal") params.set("s", s.style);
  const on = (Object.keys(s.layers) as LayerId[]).filter((id) => s.layers[id].on);
  if (on.length) params.set("l", on.join(","));
  if (s.tracked) params.set("t", s.tracked.id);
  return `${window.location.origin}${window.location.pathname}#${params.toString()}`;
}

export function readShareHash(): {
  lat?: number;
  lon?: number;
  height?: number;
  style?: StyleId;
  layers?: LayerId[];
} | null {
  if (typeof window === "undefined") return null;
  const raw = window.location.hash.replace(/^#/, "").trim();
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  const height = Number(params.get("h"));
  const style = params.get("s") as StyleId | null;
  const layers = (params.get("l") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter((x): x is LayerId => x in LAYER_META);
  return {
    lat: Number.isFinite(lat) ? lat : undefined,
    lon: Number.isFinite(lon) ? lon : undefined,
    height: Number.isFinite(height) ? height : undefined,
    style: style && STYLES.has(style) ? style : undefined,
    layers: layers.length ? layers : undefined,
  };
}

export async function copyShareUrl() {
  const url = buildShareUrl();
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    window.prompt("Copy share link", url);
    return false;
  }
}
