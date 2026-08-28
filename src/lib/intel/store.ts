import { create } from "zustand";
import type {
  DetectionBox,
  EngineApi,
  Freshness,
  LayerId,
  MapSourceId,
  StyleId,
  Tracked,
} from "./types";
import { LAYER_META } from "./types";

const FIRST_RUN_KEY = "gev:hide-first-run";

export type LayerState = {
  on: boolean;
  count: number;
  freshness: Freshness;
  detail: string;
};

type IntelState = {
  ready: boolean;
  bootStatus: string;
  style: StyleId;
  mapSource: MapSourceId;
  hud: boolean;
  detection: boolean;
  detectionDensity: number;
  detections: DetectionBox[];
  cockpit: boolean;
  cleanUi: boolean;
  firstRun: boolean;
  command: string;
  commandHint: string;
  toast: string;
  placeName: string;
  cam: { lat: number; lon: number; height: number; heading: number };
  tracked: Tracked | null;
  layers: Record<LayerId, LayerState>;
  weather: { temp: string; wind: string; sky: string } | null;
  engine: EngineApi | null;
  setEngine: (api: EngineApi | null) => void;
  setReady: (v: boolean) => void;
  setBoot: (s: string) => void;
  setStyle: (s: StyleId) => void;
  setMapSource: (s: MapSourceId) => void;
  setHud: (v: boolean) => void;
  setDetection: (v: boolean) => void;
  setDensity: (n: number) => void;
  setDetections: (d: DetectionBox[]) => void;
  setCockpit: (v: boolean) => void;
  setCleanUi: (v: boolean) => void;
  dismissFirstRun: (persist: boolean) => void;
  setCommand: (s: string) => void;
  setHint: (s: string) => void;
  setToast: (s: string) => void;
  setPlace: (s: string) => void;
  setCam: (c: IntelState["cam"]) => void;
  setTracked: (t: Tracked | null) => void;
  setLayer: (id: LayerId, patch: Partial<LayerState>) => void;
  setWeather: (w: IntelState["weather"]) => void;
};

function defaultLayers(): Record<LayerId, LayerState> {
  return {
    flights: { on: false, count: 0, freshness: "off", detail: LAYER_META.flights.source },
    military: { on: false, count: 0, freshness: "off", detail: LAYER_META.military.source },
    vessels: { on: false, count: 0, freshness: "off", detail: LAYER_META.vessels.source },
    satellites: { on: false, count: 0, freshness: "off", detail: LAYER_META.satellites.source },
    earthquakes: { on: false, count: 0, freshness: "off", detail: LAYER_META.earthquakes.source },
    fires: { on: false, count: 0, freshness: "off", detail: LAYER_META.fires.source },
    launches: { on: false, count: 0, freshness: "off", detail: LAYER_META.launches.source },
  };
}

export function hydrateFirstRun() {
  if (typeof window === "undefined") return;
  try {
    if (window.localStorage.getItem(FIRST_RUN_KEY) === "1") {
      useIntel.setState({ firstRun: false });
    }
  } catch {
    /* ignore */
  }
}

export const useIntel = create<IntelState>((set) => ({
  ready: false,
  bootStatus: "Configuring viewer",
  style: "normal",
  mapSource: "satellite",
  hud: true,
  detection: false,
  detectionDensity: 50,
  detections: [],
  cockpit: false,
  cleanUi: false,
  firstRun: true,
  command: "",
  commandHint: "Take me to Tokyo · track nearest aircraft · night vision",
  toast: "",
  placeName: "Earth",
  cam: { lat: 20, lon: -30, height: 20_000_000, heading: 0 },
  tracked: null,
  layers: defaultLayers(),
  weather: null,
  engine: null,
  setEngine: (engine) => set({ engine }),
  setReady: (ready) => set({ ready }),
  setBoot: (bootStatus) => set({ bootStatus }),
  setStyle: (style) => set({ style }),
  setMapSource: (mapSource) => set({ mapSource }),
  setHud: (hud) => set({ hud }),
  setDetection: (detection) => set({ detection }),
  setDensity: (detectionDensity) => set({ detectionDensity }),
  setDetections: (detections) => set({ detections }),
  setCockpit: (cockpit) => set({ cockpit }),
  setCleanUi: (cleanUi) => set({ cleanUi }),
  dismissFirstRun: (persist) => {
    if (persist && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(FIRST_RUN_KEY, "1");
      } catch {
        /* ignore */
      }
    }
    set({ firstRun: false });
  },
  setCommand: (command) => set({ command }),
  setHint: (commandHint) => set({ commandHint }),
  setToast: (toast) => set({ toast }),
  setPlace: (placeName) => set({ placeName }),
  setCam: (cam) => set({ cam }),
  setTracked: (tracked) => set({ tracked }),
  setLayer: (id, patch) =>
    set((s) => ({ layers: { ...s.layers, [id]: { ...s.layers[id], ...patch } } })),
  setWeather: (weather) => set({ weather }),
}));

let toastTimer: number | undefined;
export function flash(message: string) {
  useIntel.getState().setToast(message);
  if (typeof window === "undefined") return;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => useIntel.getState().setToast(""), 2800);
}
