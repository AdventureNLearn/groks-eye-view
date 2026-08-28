import { getEarthquakes, getFires, getIss, getLaunches, getSatellites, geocodePlace } from "@/lib/feeds/world";
import { getFlights, getMilitary } from "@/lib/feeds/flights";
import { getVessels } from "@/lib/feeds/ais";
import { json2satrec, propagate, gstime, eciToGeodetic, degreesLat, degreesLong } from "satellite.js";
import { flash, useIntel } from "./store";
import { feedAuth } from "./feedKeys";
import { matchPreset } from "./locations";
import { readShareHash } from "./share";
import { simulatedFlights } from "./simFlights";
import { simulatedVessels } from "./vessels";
import type { EngineApi, FlightSample, MapSourceId, SatCatalogItem, StyleId, Tracked } from "./types";
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

type Mark = {
  id: string;
  lat: number;
  lon: number;
  label: string;
  kind: string;
  color: string;
};

function satLatLon(item: SatCatalogItem): { lat: number; lon: number } | null {
  try {
    const rec = json2satrec({
      OBJECT_NAME: item.rec.OBJECT_NAME,
      OBJECT_ID: item.rec.OBJECT_ID,
      EPOCH: item.rec.EPOCH,
      MEAN_MOTION: item.rec.MEAN_MOTION,
      ECCENTRICITY: item.rec.ECCENTRICITY,
      INCLINATION: item.rec.INCLINATION,
      RA_OF_ASC_NODE: item.rec.RA_OF_ASC_NODE,
      ARG_OF_PERICENTER: item.rec.ARG_OF_PERICENTER,
      MEAN_ANOMALY: item.rec.MEAN_ANOMALY,
      NORAD_CAT_ID: item.rec.NORAD_CAT_ID,
      ELEMENT_SET_NO: item.rec.ELEMENT_SET_NO,
      BSTAR: item.rec.BSTAR,
      MEAN_MOTION_DOT: item.rec.MEAN_MOTION_DOT,
      MEAN_MOTION_DDOT: item.rec.MEAN_MOTION_DDOT,
    });
    const now = new Date();
    const pv = propagate(rec, now);
    if (!pv?.position) return null;
    const geo = eciToGeodetic(pv.position, gstime(now));
    const lat = degreesLat(geo.latitude);
    const lon = degreesLong(geo.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch {
    return null;
  }
}

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
    const showLab = zoom >= 4.2;
    for (const m of marks) {
      const p = project(m.lon, m.lat);
      if (p.x < -28 || p.y < -28 || p.x > w + 28 || p.y > h + 28) continue;
      seen.add(m.id);
      let el = dots.get(m.id);
      if (!el) {
        el = document.createElement("button");
        el.type = "button";
        el.className = "flat-mark";
        el.innerHTML = `<span class="flat-mark-dot"></span><span class="flat-mark-lab"></span>`;
        const id = m.id;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          const hit = marks.find((x) => x.id === id);
          if (hit) select(hit);
        });
        dots.set(m.id, el);
        markLayer.appendChild(el);
      }
      el.dataset.kind = m.kind;
      el.style.setProperty("--mark", m.color);
      el.style.transform = `translate(${p.x}px, ${p.y}px)`;
      el.setAttribute("aria-label", m.label);
      el.title = m.label;
      const lab = el.querySelector(".flat-mark-lab");
      const named = m.kind === "satellite" || m.kind === "launch" || m.kind === "earthquake" || showLab;
      if (lab) {
        lab.textContent = named ? m.label : "";
        lab.classList.toggle("is-on", named);
      }
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

  let loadGen = 0;

  function seedLocal() {
    const layers = useIntel.getState().layers;
    const next: Mark[] = [...marks];
    const keep = new Set(next.map((m) => m.id));
    const add = (m: Mark) => {
      if (keep.has(m.id)) return;
      keep.add(m.id);
      next.push(m);
    };
    if (layers.flights.on) {
      for (const f of simulatedFlights()) {
        add({
          id: `flt-${f.id}`,
          lat: f.lat,
          lon: f.lon,
          label: f.callsign || f.id,
          kind: "flight",
          color: "var(--color-flight)",
        });
      }
      useIntel.getState().setLayer("flights", {
        count: next.filter((m) => m.kind === "flight").length,
        freshness: "simulated",
        detail: "Simulated corridors",
      });
    }
    if (layers.vessels.on) {
      for (const v of simulatedVessels()) {
        add({
          id: v.id,
          lat: v.lat,
          lon: v.lon,
          label: v.name,
          kind: "vessel",
          color: "var(--color-ship)",
        });
      }
      useIntel.getState().setLayer("vessels", {
        count: next.filter((m) => m.kind === "vessel").length,
        freshness: "simulated",
        detail: LAYER_META.vessels.source,
      });
    }
    marks = next;
    renderMarks();
  }

  async function refreshMarks() {
    if (destroyed) return;
    const my = ++loadGen;
    const layers = useIntel.getState().layers;
    const next: Mark[] = [];

    if (layers.flights.on) {
      let live: FlightSample[] = [];
      let freshness: "live" | "delayed" | "simulated" | "error" = "simulated";
      let detail = "Simulated corridors";
      try {
        const data = await getFlights({ data: feedAuth() });
        live = data.flights ?? [];
        if (live.length) {
          freshness = data.freshness === "error" ? "simulated" : data.freshness;
          detail = data.source;
        }
      } catch {
        live = [];
      }
      const samples = live.length > 0 ? live.slice(0, 140) : simulatedFlights();
      for (const f of samples) {
        next.push({
          id: `flt-${f.id}`,
          lat: f.lat,
          lon: f.lon,
          label: f.callsign || f.id,
          kind: "flight",
          color: "var(--color-flight)",
        });
      }
      useIntel.getState().setLayer("flights", {
        count: samples.length,
        freshness: live.length > 0 ? freshness : "simulated",
        detail: live.length > 0 ? detail : "Simulated corridors · live feed unavailable",
      });
    } else {
      useIntel.getState().setLayer("flights", { count: 0, freshness: "off" });
    }

    if (layers.military.on) {
      try {
        const data = await getMilitary();
        const rows = (data.flights ?? []).slice(0, 80);
        for (const f of rows) {
          next.push({
            id: `mil-${f.id}`,
            lat: f.lat,
            lon: f.lon,
            label: f.callsign || f.id,
            kind: "military",
            color: "var(--color-mil)",
          });
        }
        useIntel.getState().setLayer("military", {
          count: rows.length,
          freshness: data.freshness,
          detail: data.source,
        });
      } catch (err) {
        useIntel.getState().setLayer("military", {
          count: 0,
          freshness: "error",
          detail: err instanceof Error ? err.message : "Military feed failed",
        });
      }
    } else {
      useIntel.getState().setLayer("military", { count: 0, freshness: "off" });
    }

    if (layers.vessels.on) {
      let rows = simulatedVessels();
      let freshness: "live" | "simulated" = "simulated";
      let detail = LAYER_META.vessels.source;
      try {
        const data = await getVessels({ data: feedAuth() });
        if (data.vessels.length) {
          rows = data.vessels;
          freshness = data.freshness;
          detail = data.source;
        }
      } catch {
        /* modeled lanes */
      }
      for (const v of rows) {
        next.push({
          id: v.id,
          lat: v.lat,
          lon: v.lon,
          label: v.name,
          kind: "vessel",
          color: "var(--color-ship)",
        });
      }
      useIntel.getState().setLayer("vessels", {
        count: rows.length,
        freshness,
        detail,
      });
    } else {
      useIntel.getState().setLayer("vessels", { count: 0, freshness: "off" });
    }

    if (layers.earthquakes.on) {
      try {
        const data = await getEarthquakes();
        const rows = (data.items ?? []).slice(0, 80);
        for (const q of rows) {
          next.push({
            id: `eq-${q.id}`,
            lat: q.lat,
            lon: q.lon,
            label: `M${q.mag.toFixed(1)} ${q.title}`,
            kind: "earthquake",
            color: "var(--color-quake)",
          });
        }
        useIntel.getState().setLayer("earthquakes", {
          count: rows.length,
          freshness: data.freshness,
          detail: data.source,
        });
      } catch (err) {
        useIntel.getState().setLayer("earthquakes", {
          count: 0,
          freshness: "error",
          detail: err instanceof Error ? err.message : "USGS failed",
        });
      }
    } else {
      useIntel.getState().setLayer("earthquakes", { count: 0, freshness: "off" });
    }

    if (layers.fires.on) {
      try {
        const data = await getFires({ data: feedAuth() });
        const rows = (data.items ?? []).slice(0, 80);
        for (const f of rows) {
          next.push({
            id: `fire-${f.id}`,
            lat: f.lat,
            lon: f.lon,
            label: f.title || "Fire",
            kind: "fire",
            color: "var(--color-fire)",
          });
        }
        useIntel.getState().setLayer("fires", {
          count: rows.length,
          freshness: data.freshness,
          detail: data.source,
        });
      } catch (err) {
        useIntel.getState().setLayer("fires", {
          count: 0,
          freshness: "error",
          detail: err instanceof Error ? err.message : "EONET failed",
        });
      }
    } else {
      useIntel.getState().setLayer("fires", { count: 0, freshness: "off" });
    }

    if (layers.launches.on) {
      try {
        const data = await getLaunches();
        const rows = (data.items ?? []).slice(0, 40);
        for (const m of rows) {
          next.push({
            id: `msn-${m.id}`,
            lat: m.lat,
            lon: m.lon,
            label: m.name,
            kind: "launch",
            color: "var(--color-sat)",
          });
        }
        useIntel.getState().setLayer("launches", {
          count: rows.length,
          freshness: data.freshness,
          detail: data.source,
        });
      } catch (err) {
        useIntel.getState().setLayer("launches", {
          count: 0,
          freshness: "error",
          detail: err instanceof Error ? err.message : "Launch feed failed",
        });
      }
    } else {
      useIntel.getState().setLayer("launches", { count: 0, freshness: "off" });
    }

    if (layers.satellites.on) {
      let count = 0;
      try {
        const iss = await getIss();
        if (iss) {
          next.push({
            id: "sat-25544",
            lat: iss.lat,
            lon: iss.lon,
            label: "ISS",
            kind: "satellite",
            color: "var(--color-ship)",
          });
          count += 1;
        }
        const data = await getSatellites();
        const items = (data.items ?? []).filter((s) => s.norad !== 25544).slice(0, 48);
        for (const item of items) {
          const pos = satLatLon(item);
          if (!pos) continue;
          next.push({
            id: `sat-${item.norad}`,
            lat: pos.lat,
            lon: pos.lon,
            label: item.name,
            kind: "satellite",
            color: "var(--color-sat)",
          });
          count += 1;
        }
        useIntel.getState().setLayer("satellites", {
          count,
          freshness: data.freshness,
          detail: data.source,
        });
      } catch (err) {
        useIntel.getState().setLayer("satellites", {
          count,
          freshness: count ? "delayed" : "error",
          detail: err instanceof Error ? err.message : "Catalog failed",
        });
      }
    } else {
      useIntel.getState().setLayer("satellites", { count: 0, freshness: "off" });
    }

    if (destroyed || my !== loadGen) return;
    marks = next;
    renderMarks();
  }

  const unsub = useIntel.subscribe((s, prev) => {
    if (s.mapSource !== prev.mapSource) api.setMapSource(s.mapSource);
    if (s.style !== prev.style) api.setStyle(s.style);
    const layerChanged = (Object.keys(s.layers) as Array<keyof typeof s.layers>).some(
      (id) => s.layers[id].on !== prev.layers[id].on,
    );
    if (layerChanged) {
      seedLocal();
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
  seedLocal();
  void refreshMarks();
  const markTimer = window.setInterval(() => void refreshMarks(), 8_000);

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
