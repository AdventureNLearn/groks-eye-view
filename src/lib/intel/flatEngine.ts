import { getEarthquakes, getFires, getIss, geocodePlace } from "@/lib/feeds/world";
import { getFlights } from "@/lib/feeds/flights";
import { flash, useIntel } from "./store";
import { matchPreset } from "./locations";
import { readShareHash } from "./share";
import type { EngineApi, MapSourceId, StyleId, Tracked } from "./types";
import { LAYER_META } from "./types";

const TILE = 256;
const ESRI =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const CARTO = "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png";

function lonToX(lon: number, z: number) {
  return ((lon + 180) / 360) * TILE * 2 ** z;
}
function latToY(lat: number, z: number) {
  const s = Math.sin((lat * Math.PI) / 180);
  const c = Math.min(0.9999, Math.max(-0.9999, s));
  return (0.5 - Math.log((1 + c) / (1 - c)) / (4 * Math.PI)) * TILE * 2 ** z;
}
function xToLon(x: number, z: number) {
  return (x / (TILE * 2 ** z)) * 360 - 180;
}
function yToLat(y: number, z: number) {
  const n = Math.PI - (2 * Math.PI * y) / (TILE * 2 ** z);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}
function heightToZoom(heightM: number) {
  const z = Math.log2(40_000_000 / Math.max(800, heightM));
  return Math.min(13, Math.max(1.4, z));
}
function zoomToHeight(z: number) {
  return 40_000_000 / 2 ** z;
}

function tileBase(source: MapSourceId) {
  if (source === "streets") return OSM;
  if (source === "night") return CARTO;
  return ESRI;
}

type Mark = { id: string; lat: number; lon: number; label: string; kind: string; color: string };

export async function bootFlatMap(container: HTMLDivElement): Promise<() => void> {
  useIntel.getState().setBoot("Laying satellite tiles", 20);

  const root = document.createElement("div");
  root.className = "flat-map";
  root.setAttribute("aria-label", "Satellite map");
  const tileLayer = document.createElement("div");
  tileLayer.className = "flat-map-tiles";
  const markLayer = document.createElement("div");
  markLayer.className = "flat-map-marks";
  root.append(tileLayer, markLayer);
  container.replaceChildren(root);

  const imgs = new Map<string, HTMLImageElement>();
  const dots = new Map<string, HTMLButtonElement>();
  let lon = 10;
  let lat = 22;
  let zoom = 1.7;
  let source: MapSourceId = "satellite";
  let destroyed = false;
  let marks: Mark[] = [];

  function size() {
    return { w: Math.max(1, root.clientWidth || container.clientWidth || window.innerWidth), h: Math.max(1, root.clientHeight || container.clientHeight || window.innerHeight) };
  }

  function project(lo: number, la: number) {
    const { w, h } = size();
    const zInt = Math.floor(zoom);
    const k = 2 ** (zoom - zInt);
    const cx = lonToX(lon, zInt);
    const cy = latToY(lat, zInt);
    const x = (lonToX(lo, zInt) - cx) * k + w / 2;
    const y = (latToY(la, zInt) - cy) * k + h / 2;
    return { x, y };
  }

  function renderTiles() {
    const { w, h } = size();
    const zInt = Math.min(13, Math.max(1, Math.floor(zoom)));
    const k = 2 ** (zoom - zInt);
    const cx = lonToX(lon, zInt);
    const cy = latToY(lat, zInt);
    const n = 2 ** zInt;
    const tw = TILE * k;
    const x0 = Math.floor((cx - w / 2 / k) / TILE);
    const y0 = Math.floor((cy - h / 2 / k) / TILE);
    const x1 = Math.floor((cx + w / 2 / k) / TILE);
    const y1 = Math.floor((cy + h / 2 / k) / TILE);
    const seen = new Set<string>();
    const base = tileBase(source);
    for (let ty = y0; ty <= y1; ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = x0; tx <= x1; tx++) {
        const wrapped = ((tx % n) + n) % n;
        const key = `${zInt}/${wrapped}/${ty}/${source}`;
        seen.add(key);
        let img = imgs.get(key);
        if (!img) {
          img = document.createElement("img");
          img.alt = "";
          img.decoding = "async";
          img.draggable = false;
          img.src = base.replace("{z}", String(zInt)).replace("{x}", String(wrapped)).replace("{y}", String(ty));
          imgs.set(key, img);
          tileLayer.appendChild(img);
        }
        const left = (tx * TILE - cx) * k + w / 2;
        const top = (ty * TILE - cy) * k + h / 2;
        img.style.transform = `translate(${left}px, ${top}px) scale(${k})`;
      }
    }
    for (const [key, img] of imgs) {
      if (seen.has(key)) continue;
      img.remove();
      imgs.delete(key);
    }
  }

  function renderMarks() {
    const seen = new Set<string>();
    const { w, h } = size();
    for (const m of marks) {
      const p = project(m.lon, m.lat);
      if (p.x < -24 || p.y < -24 || p.x > w + 24 || p.y > h + 24) continue;
      seen.add(m.id);
      let el = dots.get(m.id);
      if (!el) {
        el = document.createElement("button");
        el.type = "button";
        el.className = "flat-mark";
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const hit = marks.find((x) => x.id === m.id);
          if (hit) select(hit);
        });
        dots.set(m.id, el);
        markLayer.appendChild(el);
      }
      el.dataset.kind = m.kind;
      el.style.background = m.color;
      el.style.transform = `translate(${p.x}px, ${p.y}px)`;
      el.setAttribute("aria-label", m.label);
      el.title = m.label;
    }
    for (const [id, el] of dots) {
      if (seen.has(id)) continue;
      el.remove();
      dots.delete(id);
    }
  }

  function paint() {
    renderTiles();
    renderMarks();
    useIntel.getState().setCam({
      lat,
      lon,
      height: zoomToHeight(zoom),
      heading: 0,
    });
  }

  function select(m: Mark) {
    const tracked: Tracked = {
      id: m.id,
      kind: m.kind as Tracked["kind"],
      name: m.label,
      meta: "Phone map",
      lat: m.lat,
      lon: m.lon,
      altM: 0,
      heading: 0,
      speedMs: 0,
      vertMs: 0,
      source: "map",
      freshness: "live",
    };
    useIntel.getState().setTracked(tracked);
    lon = m.lon;
    lat = m.lat;
    zoom = Math.max(zoom, 6);
    paint();
  }

  function flyTo(nextLon: number, nextLat: number, heightM: number) {
    lon = ((nextLon + 540) % 360) - 180;
    lat = Math.min(85, Math.max(-85, nextLat));
    zoom = heightToZoom(heightM);
    paint();
  }

  const api: EngineApi = {
    flyTo: (lo, la, heightM) => flyTo(lo, la, heightM),
    resetGlobe: () => flyTo(10, 22, 22_000_000),
    track: (id) => {
      if (!id) useIntel.getState().setTracked(null);
      else {
        const hit = marks.find((m) => m.id === id);
        if (hit) select(hit);
      }
    },
    trackNearest: (kind) => {
      const want = kind === "iss" ? "satellite" : kind;
      const { w, h } = size();
      let best: Mark | null = null;
      let bestD = Infinity;
      for (const m of marks) {
        if (kind === "iss" && m.id !== "sat-25544" && !/iss/i.test(m.label)) continue;
        if (kind !== "iss" && m.kind !== want && !(kind === "flight" && m.kind === "military")) continue;
        const p = project(m.lon, m.lat);
        const d = (p.x - w / 2) ** 2 + (p.y - h / 2) ** 2;
        if (d < bestD) {
          bestD = d;
          best = m;
        }
      }
      if (!best) return false;
      select(best);
      return true;
    },
    enterCockpit: () => useIntel.getState().setCockpit(false),
    setStyle: (style: StyleId) => {
      root.dataset.style = style;
      useIntel.getState().setStyle(style);
    },
    setMapSource: (next: MapSourceId) => {
      source = next;
      for (const img of imgs.values()) img.remove();
      imgs.clear();
      useIntel.getState().setMapSource(next);
      paint();
    },
    nextContact: () => {
      if (!marks.length) return;
      const cur = useIntel.getState().tracked?.id;
      const i = Math.max(0, marks.findIndex((m) => m.id === cur));
      select(marks[(i + 1) % marks.length]);
    },
    lookupPlace: async (q: string) => {
      const preset = matchPreset(q);
      if (preset) {
        flyTo(preset.lon, preset.lat, preset.height);
        useIntel.getState().setPlace(preset.name);
        flash(preset.name);
        return true;
      }
      try {
        const res = await geocodePlace({ data: { q } });
        const hit = res.results[0];
        if (!hit) return false;
        flyTo(hit.lon, hit.lat, 80_000);
        useIntel.getState().setPlace(hit.name.split(",")[0] ?? hit.name);
        flash(hit.name.split(",")[0] ?? hit.name);
        return true;
      } catch {
        return false;
      }
    },
  };

  let pointers = new Map<number, { x: number; y: number }>();
  let lastPinch = 0;
  root.addEventListener("pointerdown", (e) => {
    root.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  root.addEventListener("pointerup", (e) => {
    pointers.delete(e.pointerId);
    lastPinch = 0;
  });
  root.addEventListener("pointercancel", (e) => {
    pointers.delete(e.pointerId);
    lastPinch = 0;
  });
  root.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const pts = [...pointers.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (lastPinch) {
        const factor = dist / lastPinch;
        zoom = Math.min(13, Math.max(1.4, zoom + Math.log2(factor)));
      }
      lastPinch = dist;
      paint();
      return;
    }
    if (!prev) return;
    const zInt = Math.floor(zoom);
    const k = 2 ** (zoom - zInt);
    lon = xToLon(lonToX(lon, zInt) - (e.clientX - prev.x) / k, zInt);
    lat = Math.min(85, Math.max(-85, yToLat(latToY(lat, zInt) - (e.clientY - prev.y) / k, zInt)));
    paint();
  });
  root.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoom = Math.min(13, Math.max(1.4, zoom - e.deltaY * 0.01));
      paint();
    },
    { passive: false },
  );

  async function refreshMarks() {
    if (destroyed) return;
    const layers = useIntel.getState().layers;
    const next: Mark[] = [];
    try {
      if (layers.flights.on) {
        const data = await getFlights();
        for (const f of (data.flights ?? []).slice(0, 80)) {
          next.push({
            id: `flt-${f.id}`,
            lat: f.lat,
            lon: f.lon,
            label: f.callsign || f.id,
            kind: f.military ? "military" : "flight",
            color: f.military ? "#e8b86d" : "#7ec8e8",
          });
        }
      }
      if (layers.earthquakes.on) {
        const data = await getEarthquakes();
        for (const q of (data.items ?? []).slice(0, 40)) {
          next.push({
            id: `eq-${q.id}`,
            lat: q.lat,
            lon: q.lon,
            label: `M${q.mag.toFixed(1)} ${q.title}`,
            kind: "earthquake",
            color: "#e36d6d",
          });
        }
      }
      if (layers.fires.on) {
        const data = await getFires();
        for (const f of (data.items ?? []).slice(0, 40)) {
          next.push({
            id: `fire-${f.id}`,
            lat: f.lat,
            lon: f.lon,
            label: f.title || "Fire",
            kind: "fire",
            color: "#e8b86d",
          });
        }
      }
      if (layers.satellites.on) {
        const iss = await getIss();
        if (iss) {
          next.push({
            id: "sat-25544",
            lat: iss.lat,
            lon: iss.lon,
            label: "ISS",
            kind: "satellite",
            color: "#7ee0a8",
          });
        }
      }
    } catch {
      /* keep last marks */
    }
    if (destroyed) return;
    marks = next;
    useIntel.getState().setLayer("flights", {
      count: next.filter((m) => m.kind === "flight" || m.kind === "military").length,
      freshness: layers.flights.on ? LAYER_META.flights.freshness : "off",
    });
    renderMarks();
  }

  const unsub = useIntel.subscribe((s, prev) => {
    if (s.mapSource !== prev.mapSource) api.setMapSource(s.mapSource);
    if (s.style !== prev.style) api.setStyle(s.style);
    if (
      s.layers.flights.on !== prev.layers.flights.on ||
      s.layers.earthquakes.on !== prev.layers.earthquakes.on ||
      s.layers.fires.on !== prev.layers.fires.on ||
      s.layers.satellites.on !== prev.layers.satellites.on
    ) {
      void refreshMarks();
    }
  });

  const onResize = () => paint();
  window.addEventListener("resize", onResize);
  window.visualViewport?.addEventListener("resize", onResize);

  useIntel.getState().setEngine(api);
  useIntel.getState().setBoot("Tiles locked", 80);
  paint();

  const share = readShareHash();
  if (share) {
    useIntel.getState().dismissFirstRun(false);
    if (share.style) api.setStyle(share.style);
    if (share.lat != null && share.lon != null) {
      flyTo(share.lon, share.lat, share.height ?? 80_000);
    }
  }

  useIntel.getState().setBoot("We're in", 100);
  useIntel.getState().setReady(true);
  flash("Phone map is live. Pinch, drag, hunt.");
  void refreshMarks();
  const markTimer = window.setInterval(() => void refreshMarks(), 20_000);

  return () => {
    destroyed = true;
    unsub();
    window.clearInterval(markTimer);
    window.removeEventListener("resize", onResize);
    window.visualViewport?.removeEventListener("resize", onResize);
    useIntel.getState().setEngine(null);
    container.replaceChildren();
  };
}
