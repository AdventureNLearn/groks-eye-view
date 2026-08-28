import {
  getEarthquakes,
  getFires,
  getIss,
  getLaunches,
  getSatellites,
  geocodePlace,
} from "@/lib/feeds/world";
import { getFlights, getMilitary } from "@/lib/feeds/flights";
import { CRT_SHADER, FLIR_SHADER, NOIR_SHADER, NVG_SHADER, SNOW_SHADER } from "./shaders";
import { makeIcon } from "./icons";
import { flash, useIntel } from "./store";
import { deadReckon, formatKts, haversineM } from "./geo";
import { matchPreset } from "./locations";
import { simulatedVessels } from "./vessels";
import { simulatedFlights } from "./simFlights";
import { readShareHash } from "./share";
import type {
  DetectionBox,
  EngineApi,
  FireSample,
  FlightSample,
  Kind,
  LaunchSample,
  LayerId,
  MapSourceId,
  QuakeSample,
  SatCatalogItem,
  StyleId,
  Tracked,
} from "./types";
import { LAYER_META } from "./types";
import {
  json2satrec,
  propagate,
  gstime,
  eciToGeodetic,
  degreesLat,
  degreesLong,
} from "satellite.js";
import type { SatRec } from "satellite.js";

type Viewer = import("cesium").Viewer;
type Entity = import("cesium").Entity;
type ImageryLayer = import("cesium").ImageryLayer;
type Cartesian3 = import("cesium").Cartesian3;
type PostStage = { enabled: boolean };

type FlightRec = {
  sample: FlightSample;
  entity: Entity;
};

type SatRecWrap = {
  item: SatCatalogItem;
  rec: SatRec | null;
  entity: Entity;
};

type ExtraRec = {
  entity: Entity;
  contact: Tracked;
};

const ESRI =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const CARTO = "https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png";
const ISS_ID = "sat-25544";

function waitForFirstEarth(viewer: Viewer): Promise<void> {
  return new Promise((resolve) => {
    const globe = viewer.scene.globe;
    const started = Date.now();
    const LIMIT_MS = 12_000;
    let peak = 8;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearInterval(poll);
      try {
        remove();
      } catch {
        /* event already gone */
      }
      resolve();
    };
    const remove = globe.tileLoadProgressEvent.addEventListener((queued: number) => {
      if (queued > 0) peak = Math.max(peak, queued);
      const frac = queued <= 0 ? 1 : Math.max(0, 1 - queued / peak);
      useIntel.getState().setBoot(
        queued > 0 ? `Pulling Earth · ${queued}` : "Locking the view",
        48 + Math.round(frac * 48),
      );
      if (queued === 0 && Date.now() - started > 500) finish();
    });
    const poll = window.setInterval(() => {
      if (globe.tilesLoaded && Date.now() - started > 400) {
        useIntel.getState().setBoot("Locking the view", 96);
        finish();
        return;
      }
      if (Date.now() - started > LIMIT_MS) {
        useIntel.getState().setBoot("Going in anyway", 96);
        finish();
      }
    }, 250);
  });
}

export async function bootGlobe(container: HTMLDivElement): Promise<() => void> {
  (window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = "/cesiumStatic/";
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = "/cesiumStatic/Widgets/widgets.css";
  document.head.appendChild(link);

  useIntel.getState().setBoot("Loading Cesium", 12);
  const Cesium = await import("cesium");
  useIntel.getState().setBoot("Configuring viewer", 32);

  const imagery = new Cesium.UrlTemplateImageryProvider({
    url: ESRI,
    maximumLevel: 19,
    credit: "Esri, Maxar, Earthstar Geographics",
  });

  const viewer = new Cesium.Viewer(container, {
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    sceneModePicker: false,
    selectionIndicator: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    vrButton: false,
    terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    baseLayer: new Cesium.ImageryLayer(imagery),
    msaaSamples: 2,
    requestRenderMode: false,
    targetFrameRate: 60,
    contextOptions: { webgl: { preserveDrawingBuffer: true } },
  });

  viewer.scene.globe.enableLighting = false;
  viewer.scene.globe.atmosphereLightIntensity = 18;
  if (viewer.scene.skyAtmosphere) viewer.scene.skyAtmosphere.show = true;
  viewer.scene.fog.enabled = true;
  viewer.scene.globe.showGroundAtmosphere = true;
  viewer.clock.shouldAnimate = true;
  viewer.cesiumWidget.showErrorPanel = () => {};

  const icons = {
    plane: makeIcon("plane", "#7ec8e8"),
    mil: makeIcon("mil", "#e8b86d"),
    ship: makeIcon("ship", "#7ee0a8"),
    sat: makeIcon("sat", "#b7c8d8"),
    iss: makeIcon("iss", "#7ee0a8"),
    quake: makeIcon("quake", "#e36d6d"),
    fire: makeIcon("fire", "#e8b86d"),
    rocket: makeIcon("rocket", "#d7e0ea"),
  };

  const stages: Record<StyleId, PostStage | null> = {
    normal: null,
    nvg: viewer.scene.postProcessStages.add(
      new Cesium.PostProcessStage({ fragmentShader: NVG_SHADER }),
    ),
    flir: viewer.scene.postProcessStages.add(
      new Cesium.PostProcessStage({ fragmentShader: FLIR_SHADER }),
    ),
    crt: viewer.scene.postProcessStages.add(
      new Cesium.PostProcessStage({ fragmentShader: CRT_SHADER }),
    ),
    noir: viewer.scene.postProcessStages.add(
      new Cesium.PostProcessStage({ fragmentShader: NOIR_SHADER }),
    ),
    snow: viewer.scene.postProcessStages.add(
      new Cesium.PostProcessStage({ fragmentShader: SNOW_SHADER }),
    ),
  };
  for (const s of Object.values(stages)) if (s) s.enabled = false;

  const flights = new Map<string, FlightRec>();
  const military = new Map<string, FlightRec>();
  const vessels = new Map<string, Entity>();
  const sats = new Map<string, SatRecWrap>();
  const extras = new Map<string, ExtraRec>();
  let satCatalog: SatCatalogItem[] = [];
  let orbitEntity: Entity | null = null;
  let trackedId: string | null = null;
  let cockpit = false;
  let destroyed = false;
  let mapSource: MapSourceId = "satellite";
  let imageryLayer: ImageryLayer = viewer.imageryLayers.get(0);
  let lastCamWrite = 0;

  function cartesian(lon: number, lat: number, alt: number): Cartesian3 {
    return Cesium.Cartesian3.fromDegrees(lon, lat, alt);
  }

  function setCartesian(entity: Entity, pos: Cartesian3) {
    const prop = entity.position as { setValue?: (v: Cartesian3) => void } | undefined;
    if (prop && typeof prop.setValue === "function") prop.setValue(pos);
  }

  function setHeading(entity: Entity, heading: number) {
    const rot = Cesium.Math.toRadians(90 - heading);
    const prop = entity.billboard?.rotation as { setValue?: (v: number) => void } | undefined;
    if (prop && typeof prop.setValue === "function") prop.setValue(rot);
  }

  function applyStyle(style: StyleId) {
    for (const [k, stage] of Object.entries(stages)) {
      if (stage) stage.enabled = k === style;
    }
    viewer.scene.globe.enableLighting = style === "nvg" || style === "flir" || style === "noir";
    container.closest(".intel-shell")?.setAttribute("data-style", style);
  }

  function setMap(source: MapSourceId) {
    if (source === mapSource) return;
    mapSource = source;
    const url = source === "streets" ? OSM : source === "night" ? CARTO : ESRI;
    const credit =
      source === "streets"
        ? "© OpenStreetMap"
        : source === "night"
          ? "CARTO"
          : "Esri, Maxar, Earthstar Geographics";
    const next = new Cesium.ImageryLayer(
      new Cesium.UrlTemplateImageryProvider({ url, maximumLevel: 18, credit }),
    );
    viewer.imageryLayers.add(next);
    viewer.imageryLayers.remove(imageryLayer);
    imageryLayer = next;
  }

  function labelOpts(text: string, color: string) {
    return {
      text,
      font: "11px IBM Plex Mono, monospace",
      fillColor: Cesium.Color.fromCssColorString(color),
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString("#0e1218").withAlpha(0.78),
      pixelOffset: new Cesium.Cartesian2(0, -16),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3_000_000),
      show: false,
    };
  }

  function addFlight(sample: FlightSample, mil: boolean) {
    const id = `${mil ? "mil" : "flt"}-${sample.id}`;
    const bucket = mil ? military : flights;
    const existing = bucket.get(id);
    const pos = cartesian(sample.lon, sample.lat, Math.max(sample.altM, 80));

    if (existing) {
      setCartesian(existing.entity, pos);
      setHeading(existing.entity, sample.heading);
      existing.sample = sample;
      return;
    }

    if (bucket.size >= 900) return;

    const color = mil ? "#e8b86d" : "#7ec8e8";
    try {
      const entity = viewer.entities.add({
        id,
        name: sample.callsign,
        position: pos,
        billboard: {
          image: mil ? icons.mil : icons.plane,
          width: mil ? 20 : 16,
          height: mil ? 20 : 16,
          alignedAxis: Cesium.Cartesian3.clone(Cesium.Cartesian3.UNIT_Z),
          rotation: Cesium.Math.toRadians(90 - sample.heading),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: labelOpts(sample.callsign, color),
      });
      bucket.set(id, { sample, entity });
    } catch {
      /* skip a single bad contact */
    }
  }

  function glideFlights(bucket: Map<string, FlightRec>) {
    const now = Date.now();
    for (const rec of bucket.values()) {
      const dt = Math.min(45, Math.max(0, (now - rec.sample.ts) / 1000));
      const p = deadReckon(rec.sample.lat, rec.sample.lon, rec.sample.heading, rec.sample.speedMs, dt);
      const pos = cartesian(p.lon, p.lat, Math.max(rec.sample.altM + rec.sample.vertMs * dt, 80));
      setCartesian(rec.entity, pos);
    }
  }

  function prune(bucket: Map<string, FlightRec>, seen: Set<string>) {
    for (const [id, rec] of bucket) {
      if (seen.has(id)) continue;
      viewer.entities.remove(rec.entity);
      bucket.delete(id);
    }
  }

  async function refreshFlights() {
    if (destroyed || !useIntel.getState().layers.flights.on) return;
    try {
      const data = await getFlights();
      if (destroyed) return;
      const live = data.flights ?? [];
      const samples = live.length > 0 ? live : simulatedFlights();
      const seen = new Set<string>();
      for (const s of samples) {
        const id = `flt-${s.id}`;
        seen.add(id);
        addFlight(s, false);
      }
      prune(flights, seen);
      useIntel.getState().setLayer("flights", {
        count: flights.size,
        freshness: live.length > 0 ? data.freshness : "simulated",
        detail: live.length > 0 ? data.source : "Simulated corridors · live feed unavailable",
      });
    } catch {
      const samples = simulatedFlights();
      const seen = new Set<string>();
      for (const s of samples) {
        seen.add(`flt-${s.id}`);
        addFlight(s, false);
      }
      prune(flights, seen);
      useIntel.getState().setLayer("flights", {
        count: flights.size,
        freshness: "simulated",
        detail: "Simulated corridors · live feed unavailable",
      });
    }
  }

  async function refreshMilitary() {
    if (destroyed || !useIntel.getState().layers.military.on) return;
    try {
      const data = await getMilitary();
      if (destroyed) return;
      const seen = new Set<string>();
      for (const s of data.flights) {
        const id = `mil-${s.id}`;
        seen.add(id);
        addFlight(s, true);
      }
      prune(military, seen);
      useIntel.getState().setLayer("military", {
        count: military.size,
        freshness: data.freshness,
        detail: data.source,
      });
    } catch (err) {
      useIntel.getState().setLayer("military", {
        freshness: "error",
        detail: err instanceof Error ? err.message : "Military ADS-B failed",
      });
    }
  }

  function refreshVessels() {
    if (destroyed || !useIntel.getState().layers.vessels.on) return;
    const list = simulatedVessels();
    const seen = new Set<string>();
    for (const v of list) {
      seen.add(v.id);
      const existing = vessels.get(v.id);
      const pos = cartesian(v.lon, v.lat, 20);
      if (existing) {
        setCartesian(existing, pos);
        setHeading(existing, v.heading);
        continue;
      }
      const entity = viewer.entities.add({
        id: v.id,
        name: v.name,
        position: pos,
        billboard: {
          image: icons.ship,
          width: 14,
          height: 14,
          alignedAxis: Cesium.Cartesian3.clone(Cesium.Cartesian3.UNIT_Z),
          rotation: Cesium.Math.toRadians(90 - v.heading),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: labelOpts(v.name, "#7ee0a8"),
      });
      vessels.set(v.id, entity);
    }
    for (const [id, ent] of vessels) {
      if (seen.has(id)) continue;
      viewer.entities.remove(ent);
      vessels.delete(id);
    }
    useIntel.getState().setLayer("vessels", {
      count: vessels.size,
      freshness: "simulated",
      detail: "Modeled shipping lanes",
    });
  }

  function satPosition(rec: SatRec, date = new Date()) {
    const pv = propagate(rec, date);
    if (!pv?.position) return null;
    try {
      const geo = eciToGeodetic(pv.position, gstime(date));
      return {
        lat: degreesLat(geo.latitude),
        lon: degreesLong(geo.longitude),
        altM: geo.height * 1000,
      };
    } catch {
      return null;
    }
  }

  function updateSats() {
    if (!useIntel.getState().layers.satellites.on) return;
    for (const wrap of sats.values()) {
      if (!wrap.rec) continue;
      const p = satPosition(wrap.rec);
      if (!p) continue;
      wrap.entity.position && setCartesian(wrap.entity, cartesian(p.lon, p.lat, p.altM));
    }
  }

  function drawOrbit(rec: SatRec, id: string) {
    if (orbitEntity) {
      viewer.entities.remove(orbitEntity);
      orbitEntity = null;
    }
    const pts: Cartesian3[] = [];
    const now = Date.now();
    for (let i = 0; i <= 90; i++) {
      const p = satPosition(rec, new Date(now + i * 60_000));
      if (!p) continue;
      pts.push(cartesian(p.lon, p.lat, p.altM));
    }
    if (pts.length < 8) return;
    orbitEntity = viewer.entities.add({
      id: `orbit-${id}`,
      polyline: {
        positions: pts,
        width: 1.5,
        material: Cesium.Color.fromCssColorString("#7ee0a8").withAlpha(0.55),
        clampToGround: false,
      },
    });
  }

  function upsertIss(lat: number, lon: number, altM: number, speedMs: number) {
    const existing = sats.get(ISS_ID);
    const pos = cartesian(lon, lat, altM);
    if (existing) {
      setCartesian(existing.entity, pos);
      return;
    }
    const item: SatCatalogItem = {
      id: "25544",
      name: "ISS (ZARYA)",
      norad: 25544,
      group: "stations",
      rec: {
        OBJECT_NAME: "ISS (ZARYA)",
        OBJECT_ID: "1998-067A",
        NORAD_CAT_ID: 25544,
        EPOCH: "",
        MEAN_MOTION: 0,
        ECCENTRICITY: 0,
        INCLINATION: 51.6,
        RA_OF_ASC_NODE: 0,
        ARG_OF_PERICENTER: 0,
        MEAN_ANOMALY: 0,
        BSTAR: 0,
        MEAN_MOTION_DOT: 0,
        MEAN_MOTION_DDOT: 0,
        EPHEMERIS_TYPE: 0,
        CLASSIFICATION_TYPE: "U",
        ELEMENT_SET_NO: 0,
        REV_AT_EPOCH: 0,
      },
    };
    const entity = viewer.entities.add({
      id: ISS_ID,
      name: item.name,
      position: pos,
      billboard: {
        image: icons.iss,
        width: 26,
        height: 26,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
      label: { ...labelOpts("ISS", "#7ee0a8"), show: true },
    });
    sats.set(ISS_ID, { item, rec: null, entity });
    void speedMs;
  }

  async function refreshIss() {
    if (destroyed || !useIntel.getState().layers.satellites.on) return;
    const data = await getIss();
    if (!data || destroyed) return;
    upsertIss(data.lat, data.lon, data.altM, data.speedMs);
  }

  async function loadSats() {
    if (destroyed || !useIntel.getState().layers.satellites.on) return;
    try {
      const data = await getSatellites();
      if (destroyed) return;
      satCatalog = data.items;
      for (const [id, wrap] of sats) {
        if (id === ISS_ID) continue;
        viewer.entities.remove(wrap.entity);
        sats.delete(id);
      }
      for (const item of satCatalog) {
        if (item.norad === 25544) continue;
        let rec: SatRec;
        try {
          rec = json2satrec({
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
        } catch {
          continue;
        }
        const p = satPosition(rec);
        if (!p) continue;
        const entity = viewer.entities.add({
          id: `sat-${item.id}`,
          name: item.name,
          position: cartesian(p.lon, p.lat, p.altM),
          billboard: {
            image: icons.sat,
            width: 12,
            height: 12,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: labelOpts(item.name, "#b7c8d8"),
        });
        sats.set(`sat-${item.id}`, { item, rec, entity });
      }
      await refreshIss();
      const iss = satCatalog.find((s) => s.norad === 25544);
      if (iss) {
        try {
          const rec = json2satrec({
            OBJECT_NAME: iss.rec.OBJECT_NAME,
            OBJECT_ID: iss.rec.OBJECT_ID,
            EPOCH: iss.rec.EPOCH,
            MEAN_MOTION: iss.rec.MEAN_MOTION,
            ECCENTRICITY: iss.rec.ECCENTRICITY,
            INCLINATION: iss.rec.INCLINATION,
            RA_OF_ASC_NODE: iss.rec.RA_OF_ASC_NODE,
            ARG_OF_PERICENTER: iss.rec.ARG_OF_PERICENTER,
            MEAN_ANOMALY: iss.rec.MEAN_ANOMALY,
            NORAD_CAT_ID: iss.rec.NORAD_CAT_ID,
            ELEMENT_SET_NO: iss.rec.ELEMENT_SET_NO,
            BSTAR: iss.rec.BSTAR,
            MEAN_MOTION_DOT: iss.rec.MEAN_MOTION_DOT,
            MEAN_MOTION_DDOT: iss.rec.MEAN_MOTION_DDOT,
          });
          const wrap = sats.get(ISS_ID);
          if (wrap) wrap.rec = rec;
          drawOrbit(rec, iss.id);
        } catch {
          /* live ISS still tracks */
        }
      }
      useIntel.getState().setLayer("satellites", {
        count: sats.size,
        freshness: data.freshness === "error" && sats.size ? "delayed" : data.freshness,
        detail: data.source,
      });
    } catch (err) {
      await refreshIss();
      useIntel.getState().setLayer("satellites", {
        count: sats.size,
        freshness: sats.size ? "delayed" : "error",
        detail: err instanceof Error ? err.message : "Catalog failed",
      });
    }
  }

  function clearPrefix(prefix: string, map: Map<string, Entity>) {
    for (const [, ent] of map) viewer.entities.remove(ent);
    map.clear();
    for (const e of [...viewer.entities.values]) {
      if (e.id?.startsWith(prefix)) viewer.entities.remove(e);
    }
  }

  function purgeExtras(prefix: string) {
    for (const [id, rec] of extras) {
      if (!id.startsWith(prefix)) continue;
      viewer.entities.remove(rec.entity);
      extras.delete(id);
    }
  }

  async function loadQuakes() {
    if (!useIntel.getState().layers.earthquakes.on) return;
    try {
      const data = await getEarthquakes();
      if (destroyed) return;
      purgeExtras("eq-");
      for (const q of data.items as QuakeSample[]) {
        const id = `eq-${q.id}`;
        const size = Math.max(8, Math.min(28, q.mag * 6));
        const contact: Tracked = {
          id,
          kind: "earthquake",
          name: `M${q.mag.toFixed(1)}`,
          meta: q.title,
          lat: q.lat,
          lon: q.lon,
          altM: 0,
          heading: 0,
          speedMs: 0,
          vertMs: 0,
          source: "USGS",
          freshness: "live",
          extra: { mag: q.mag, depthKm: q.depthKm },
        };
        const ent = viewer.entities.add({
          id,
          name: q.title,
          position: cartesian(q.lon, q.lat, 0),
          billboard: {
            image: icons.quake,
            width: size,
            height: size,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: labelOpts(`M${q.mag.toFixed(1)} ${q.title}`, "#e36d6d"),
        });
        extras.set(id, { entity: ent, contact });
      }
      useIntel.getState().setLayer("earthquakes", {
        count: data.items.length,
        freshness: data.freshness,
        detail: data.source,
      });
    } catch (err) {
      useIntel.getState().setLayer("earthquakes", {
        freshness: "error",
        detail: err instanceof Error ? err.message : "USGS failed",
      });
    }
  }

  async function loadFires() {
    if (!useIntel.getState().layers.fires.on) return;
    try {
      const data = await getFires();
      if (destroyed) return;
      purgeExtras("fire-");
      for (const f of data.items as FireSample[]) {
        const id = `fire-${f.id}`;
        const contact: Tracked = {
          id,
          kind: "fire",
          name: f.title,
          meta: f.source,
          lat: f.lat,
          lon: f.lon,
          altM: 0,
          heading: 0,
          speedMs: 0,
          vertMs: 0,
          source: "NASA EONET",
          freshness: "live",
        };
        const ent = viewer.entities.add({
          id,
          name: f.title,
          position: cartesian(f.lon, f.lat, 0),
          billboard: {
            image: icons.fire,
            width: 14,
            height: 14,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: labelOpts(f.title, "#e8b86d"),
        });
        extras.set(id, { entity: ent, contact });
      }
      useIntel.getState().setLayer("fires", {
        count: data.items.length,
        freshness: data.freshness,
        detail: data.source,
      });
    } catch (err) {
      useIntel.getState().setLayer("fires", {
        freshness: "error",
        detail: err instanceof Error ? err.message : "EONET failed",
      });
    }
  }

  async function loadLaunches() {
    if (!useIntel.getState().layers.launches.on) return;
    try {
      const data = await getLaunches();
      if (destroyed) return;
      purgeExtras("msn-");
      for (const m of data.items as LaunchSample[]) {
        const id = `msn-${m.id}`;
        const contact: Tracked = {
          id,
          kind: "launch",
          name: m.name,
          meta: `${m.provider} · ${m.pad}`,
          lat: m.lat,
          lon: m.lon,
          altM: 40,
          heading: 0,
          speedMs: 0,
          vertMs: 0,
          source: "Launch Library 2",
          freshness: "live",
          extra: { net: m.net, status: m.status },
        };
        const ent = viewer.entities.add({
          id,
          name: m.name,
          position: cartesian(m.lon, m.lat, 40),
          billboard: {
            image: icons.rocket,
            width: 18,
            height: 18,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: { ...labelOpts(m.name, "#d7e0ea"), show: true },
        });
        extras.set(id, { entity: ent, contact });
      }
      useIntel.getState().setLayer("launches", {
        count: data.items.length,
        freshness: data.freshness,
        detail: data.source,
      });
    } catch (err) {
      useIntel.getState().setLayer("launches", {
        freshness: "error",
        detail: err instanceof Error ? err.message : "Launch feed failed",
      });
    }
  }

  function entityById(id: string): Entity | undefined {
    return (
      flights.get(id)?.entity ??
      military.get(id)?.entity ??
      vessels.get(id) ??
      sats.get(id)?.entity ??
      extras.get(id)?.entity ??
      viewer.entities.getById(id)
    );
  }

  function currentContact(id: string): Tracked | null {
    const flt = flights.get(id);
    if (flt) {
      return {
        id,
        kind: "flight",
        name: flt.sample.callsign,
        meta: `${formatKts(flt.sample.speedMs)} kts · ${flt.sample.origin || "ADS-B"}`,
        lat: flt.sample.lat,
        lon: flt.sample.lon,
        altM: flt.sample.altM,
        heading: flt.sample.heading,
        speedMs: flt.sample.speedMs,
        vertMs: flt.sample.vertMs,
        onGround: flt.sample.onGround,
        country: flt.sample.origin,
        source: flt.sample.id.startsWith("sim-") ? "Simulated corridors" : "OpenSky / adsb.lol",
        freshness: flt.sample.id.startsWith("sim-") ? "simulated" : "live",
      };
    }
    const mil = military.get(id);
    if (mil) {
      return {
        id,
        kind: "military",
        name: mil.sample.callsign,
        meta: `${formatKts(mil.sample.speedMs)} kts · MIL`,
        lat: mil.sample.lat,
        lon: mil.sample.lon,
        altM: mil.sample.altM,
        heading: mil.sample.heading,
        speedMs: mil.sample.speedMs,
        vertMs: mil.sample.vertMs,
        onGround: mil.sample.onGround,
        source: "adsb.lol",
        freshness: "live",
      };
    }
    const ves = simulatedVessels().find((v) => v.id === id);
    if (ves) {
      return {
        id,
        kind: "vessel",
        name: ves.name,
        meta: ves.meta,
        lat: ves.lat,
        lon: ves.lon,
        altM: 0,
        heading: ves.heading,
        speedMs: ves.speedMs,
        vertMs: 0,
        source: "Modeled shipping lanes",
        freshness: "simulated",
      };
    }
    const sat = sats.get(id);
    if (sat) {
      const p = sat.rec ? satPosition(sat.rec) : null;
      const cart = sat.entity.position?.getValue(viewer.clock.currentTime);
      let lat = p?.lat ?? 0;
      let lon = p?.lon ?? 0;
      let altM = p?.altM ?? 420_000;
      if (!p && cart) {
        const c = Cesium.Cartographic.fromCartesian(cart);
        lat = Cesium.Math.toDegrees(c.latitude);
        lon = Cesium.Math.toDegrees(c.longitude);
        altM = c.height;
      }
      return {
        id,
        kind: "satellite",
        name: sat.item.name,
        meta: `NORAD ${sat.item.norad}`,
        lat,
        lon,
        altM,
        heading: 0,
        speedMs: 7660,
        vertMs: 0,
        source: sat.rec ? "CelesTrak SGP4" : "Where The ISS At",
        freshness: "live",
      };
    }
    return extras.get(id)?.contact ?? null;
  }

  function setPathVisible(id: string | null) {
    for (const rec of [...flights.values(), ...military.values()]) {
      if (rec.entity.path) rec.entity.path.show = new Cesium.ConstantProperty(rec.entity.id === id);
      if (rec.entity.label) rec.entity.label.show = new Cesium.ConstantProperty(rec.entity.id === id);
    }
    for (const [vid, ent] of vessels) {
      if (ent.label) ent.label.show = new Cesium.ConstantProperty(vid === id);
    }
    for (const [sid, wrap] of sats) {
      const isIss = wrap.item.norad === 25544;
      if (wrap.entity.label) wrap.entity.label.show = new Cesium.ConstantProperty(sid === id || isIss);
    }
    for (const [eid, rec] of extras) {
      if (rec.entity.label) rec.entity.label.show = new Cesium.ConstantProperty(eid === id);
    }
  }

  function project(lon: number, lat: number, alt: number) {
    const pos = cartesian(lon, lat, alt);
    const st = Cesium.SceneTransforms as unknown as {
      worldToWindowCoordinates?: (scene: unknown, p: Cartesian3) => { x: number; y: number } | undefined;
      wgs84ToWindowCoordinates?: (scene: unknown, p: Cartesian3) => { x: number; y: number } | undefined;
    };
    return (
      st.worldToWindowCoordinates?.(viewer.scene, pos) ??
      st.wgs84ToWindowCoordinates?.(viewer.scene, pos)
    );
  }

  function applyDetection() {
    const { detection, detectionDensity } = useIntel.getState();
    if (!detection) {
      if (useIntel.getState().detections.length) useIntel.getState().setDetections([]);
      return;
    }
    const cam = viewer.camera.positionCartographic;
    const clat = Cesium.Math.toDegrees(cam.latitude);
    const clon = Cesium.Math.toDegrees(cam.longitude);
    const rangeM = 500_000 + detectionDensity * 40_000;
    const max = Math.round(8 + (detectionDensity / 100) * 28);
    const canvas = viewer.scene.canvas;
    type Cand = {
      d: number;
      lat: number;
      lon: number;
      alt: number;
      label: string;
      kind: Kind;
      ent?: Entity;
      force: boolean;
    };
    const cands: Cand[] = [];
    const consider = (
      ent: Entity | undefined,
      lat: number,
      lon: number,
      alt: number,
      label: string,
      kind: Kind,
      force: boolean,
    ) => {
      const d = haversineM(clat, clon, lat, lon);
      if (!force && d > rangeM) return;
      cands.push({ d, lat, lon, alt, label, kind, ent, force });
    };
    for (const rec of flights.values()) {
      consider(
        rec.entity,
        rec.sample.lat,
        rec.sample.lon,
        rec.sample.altM,
        rec.sample.callsign,
        "flight",
        rec.entity.id === trackedId,
      );
    }
    for (const rec of military.values()) {
      consider(
        rec.entity,
        rec.sample.lat,
        rec.sample.lon,
        rec.sample.altM,
        rec.sample.callsign,
        "military",
        rec.entity.id === trackedId,
      );
    }
    for (const v of simulatedVessels()) {
      consider(vessels.get(v.id), v.lat, v.lon, 20, v.name, "vessel", v.id === trackedId);
    }
    for (const wrap of sats.values()) {
      const p = wrap.rec ? satPosition(wrap.rec) : currentContact(wrap.entity.id ?? "");
      if (!p) continue;
      consider(
        wrap.entity,
        p.lat,
        p.lon,
        "altM" in p ? p.altM : 420_000,
        wrap.item.name,
        "satellite",
        wrap.item.norad === 25544,
      );
    }
    cands.sort((a, b) => a.d - b.d);
    const boxes: DetectionBox[] = [];
    for (const c of cands.slice(0, max)) {
      if (c.ent?.label) c.ent.label.show = new Cesium.ConstantProperty(true);
      const win = project(c.lon, c.lat, c.alt);
      if (!win) continue;
      if (win.x < 8 || win.y < 8 || win.x > canvas.clientWidth - 8 || win.y > canvas.clientHeight - 8) {
        continue;
      }
      boxes.push({ x: win.x, y: win.y, label: c.label, kind: c.kind });
    }
    useIntel.getState().setDetections(boxes);
  }

  function track(id: string | null) {
    trackedId = id;
    if (!id) {
      viewer.trackedEntity = undefined;
      cockpit = false;
      useIntel.getState().setCockpit(false);
      useIntel.getState().setTracked(null);
      setPathVisible(null);
      if (orbitEntity) {
        viewer.entities.remove(orbitEntity);
        orbitEntity = null;
      }
      return;
    }
    const ent = entityById(id);
    if (ent && !cockpit) viewer.trackedEntity = ent;
    setPathVisible(id);
    const c = currentContact(id);
    useIntel.getState().setTracked(c);
    if (c) {
      useIntel.getState().setPlace(c.name);
      if (id.startsWith("sat-")) {
        const wrap = sats.get(id);
        if (wrap?.rec) drawOrbit(wrap.rec, wrap.item.id);
      }
    }
    applyDetection();
  }

  function trackNearest(kind: "flight" | "vessel" | "satellite" | "iss") {
    const cam = viewer.camera.positionCartographic;
    const clat = Cesium.Math.toDegrees(cam.latitude);
    const clon = Cesium.Math.toDegrees(cam.longitude);
    let bestId: string | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    const consider = (id: string, lat: number, lon: number, ok: boolean) => {
      if (!ok) return;
      const d = haversineM(clat, clon, lat, lon);
      if (d < bestD) {
        bestD = d;
        bestId = id;
      }
    };
    if (kind === "flight") {
      for (const [id, rec] of [...flights, ...military]) {
        consider(id, rec.sample.lat, rec.sample.lon, !rec.sample.onGround);
      }
    } else if (kind === "vessel") {
      for (const v of simulatedVessels()) consider(v.id, v.lat, v.lon, true);
    } else {
      for (const [id, wrap] of sats) {
        const p = wrap.rec ? satPosition(wrap.rec) : currentContact(id);
        if (!p) continue;
        const isIss = wrap.item.norad === 25544 || /ISS/i.test(wrap.item.name);
        consider(id, p.lat, p.lon, kind === "iss" ? isIss : true);
      }
    }
    if (!bestId) return false;
    const layerOn: LayerId =
      kind === "vessel" ? "vessels" : kind === "flight" ? "flights" : "satellites";
    if (!useIntel.getState().layers[layerOn].on) {
      useIntel.getState().setLayer(layerOn, { on: true, freshness: "live" });
    }
    track(bestId);
    const ent = entityById(bestId);
    if (ent && !cockpit) void viewer.flyTo(ent, { duration: 2.2 });
    return true;
  }

  function nextContact() {
    const ids = [...flights.keys(), ...military.keys()];
    if (!ids.length) return;
    const i = Math.max(0, ids.indexOf(trackedId ?? ""));
    track(ids[(i + 1) % ids.length] ?? ids[0]);
  }

  function enterCockpit(on: boolean) {
    cockpit = on;
    useIntel.getState().setCockpit(on);
    if (on) {
      viewer.trackedEntity = undefined;
      if (!trackedId) trackNearest("flight");
    } else {
      viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
      const ent = trackedId ? entityById(trackedId) : undefined;
      if (ent) viewer.trackedEntity = ent;
    }
  }

  function flyTo(lon: number, lat: number, heightM: number, duration = 2.6) {
    viewer.trackedEntity = undefined;
    cockpit = false;
    useIntel.getState().setCockpit(false);
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, heightM),
      duration,
    });
  }

  function resetGlobe() {
    track(null);
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(-32, 18, 22_000_000),
      duration: 2.2,
    });
    useIntel.getState().setPlace("Earth");
  }

  async function lookupPlace(q: string) {
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
      if (!hit) {
        flash(`No match for ${q}`);
        return false;
      }
      flyTo(hit.lon, hit.lat, 48_000);
      useIntel.getState().setPlace(hit.name.split(",")[0] ?? hit.name);
      flash(hit.name.split(",")[0] ?? hit.name);
      return true;
    } catch {
      flash("Geocoder unavailable");
      return false;
    }
  }

  const api: EngineApi = {
    flyTo,
    resetGlobe,
    track,
    trackNearest,
    enterCockpit,
    setStyle: (s) => {
      useIntel.getState().setStyle(s);
      applyStyle(s);
    },
    setMapSource: (s) => {
      useIntel.getState().setMapSource(s);
      setMap(s);
    },
    nextContact,
    lookupPlace,
  };

  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  handler.setInputAction((click: { position: import("cesium").Cartesian2 }) => {
    const picked = viewer.scene.pick(click.position) as { id?: { id?: string } } | undefined;
    const id = picked?.id?.id;
    if (typeof id === "string" && !id.startsWith("orbit-")) track(id);
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

  const removeTick = viewer.clock.onTick.addEventListener(() => {
    if (destroyed) return;
    try {
      if (cockpit && trackedId) {
        const ent = entityById(trackedId);
        const contact = currentContact(trackedId);
        if (ent && contact) {
          const pos = ent.position?.getValue(viewer.clock.currentTime);
          if (pos) {
            const hpr = new Cesium.HeadingPitchRoll(
              Cesium.Math.toRadians(contact.heading),
              Cesium.Math.toRadians(-6),
              0,
            );
            const transform = Cesium.Transforms.headingPitchRollToFixedFrame(pos, hpr);
            viewer.camera.lookAtTransform(transform, new Cesium.Cartesian3(-55, 0, 14));
          }
        }
      }
      const now = Date.now();
      if (now - lastCamWrite > 280) {
        lastCamWrite = now;
        updateSats();
        const c = viewer.camera.positionCartographic;
        useIntel.getState().setCam({
          lat: Cesium.Math.toDegrees(c.latitude),
          lon: Cesium.Math.toDegrees(c.longitude),
          height: c.height,
          heading: Cesium.Math.toDegrees(viewer.camera.heading),
        });
        if (trackedId) {
          const fresh = currentContact(trackedId);
          if (fresh) useIntel.getState().setTracked(fresh);
        }
        glideFlights(flights);
        glideFlights(military);
        applyDetection();
      }
    } catch {
      /* keep rendering */
    }
  });

  let last = useIntel.getState();
  const unsub = useIntel.subscribe((s) => {
    const prev = last;
    last = s;
    if (s.style !== prev.style) applyStyle(s.style);
    if (s.mapSource !== prev.mapSource) setMap(s.mapSource);
    if (s.layers.flights.on !== prev.layers.flights.on) {
      if (s.layers.flights.on) void refreshFlights();
      else prune(flights, new Set());
    }
    if (s.layers.military.on !== prev.layers.military.on) {
      if (s.layers.military.on) void refreshMilitary();
      else prune(military, new Set());
    }
    if (s.layers.vessels.on !== prev.layers.vessels.on) {
      if (s.layers.vessels.on) refreshVessels();
      else clearPrefix("ves-", vessels);
    }
    if (s.layers.satellites.on !== prev.layers.satellites.on) {
      if (s.layers.satellites.on) void loadSats();
      else {
        for (const wrap of sats.values()) viewer.entities.remove(wrap.entity);
        sats.clear();
        if (orbitEntity) viewer.entities.remove(orbitEntity);
        orbitEntity = null;
      }
    }
    if (s.layers.earthquakes.on !== prev.layers.earthquakes.on) {
      if (s.layers.earthquakes.on) void loadQuakes();
      else purgeExtras("eq-");
    }
    if (s.layers.fires.on !== prev.layers.fires.on) {
      if (s.layers.fires.on) void loadFires();
      else purgeExtras("fire-");
    }
    if (s.layers.launches.on !== prev.layers.launches.on) {
      if (s.layers.launches.on) void loadLaunches();
      else purgeExtras("msn-");
    }
    if (s.detection !== prev.detection || s.detectionDensity !== prev.detectionDensity) {
      applyDetection();
    }
  });

  const flightTimer = window.setInterval(() => void refreshFlights(), 20_000);
  const milTimer = window.setInterval(() => void refreshMilitary(), 22_000);
  const vesTimer = window.setInterval(() => refreshVessels(), 2500);
  const satTimer = window.setInterval(() => updateSats(), 1500);
  const issTimer = window.setInterval(() => void refreshIss(), 12_000);
  const onResize = () => viewer.resize();
  window.addEventListener("resize", onResize);

  useIntel.getState().setEngine(api);
  useIntel.getState().setBoot("Pulling Earth", 48);
  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(-32, 18, 22_000_000),
  });

  const share = readShareHash();
  if (share) {
    useIntel.getState().dismissFirstRun(false);
    if (share.style) api.setStyle(share.style);
    if (share.layers) {
      for (const id of share.layers) {
        useIntel.getState().setLayer(id, { on: true, freshness: LAYER_META[id].freshness });
      }
    }
    if (share.lat != null && share.lon != null) {
      flyTo(share.lon, share.lat, share.height ?? 80_000, 0);
    }
  }

  await waitForFirstEarth(viewer);
  useIntel.getState().setBoot("We're in", 100);
  useIntel.getState().setReady(true);
  flash("We're in. Everything here is public.");
  (window as unknown as { __gevReady?: boolean }).__gevReady = true;

  const st = useIntel.getState();
  if (st.layers.flights.on) void refreshFlights();
  if (st.layers.military.on) void refreshMilitary();
  if (st.layers.vessels.on) refreshVessels();
  if (st.layers.satellites.on) void loadSats();
  if (st.layers.earthquakes.on) void loadQuakes();
  if (st.layers.fires.on) void loadFires();
  if (st.layers.launches.on) void loadLaunches();

  return () => {
    destroyed = true;
    unsub();
    window.clearInterval(flightTimer);
    window.clearInterval(milTimer);
    window.clearInterval(vesTimer);
    window.clearInterval(satTimer);
    window.clearInterval(issTimer);
    window.removeEventListener("resize", onResize);
    handler.destroy();
    removeTick();
    useIntel.getState().setEngine(null);
    try {
      viewer.destroy();
    } catch {
      /* already torn down */
    }
    link.remove();
  };
}
