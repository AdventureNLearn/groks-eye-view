import { create } from "zustand";

export type RadioStation = {
  id: string;
  name: string;
  blurb: string;
  url: string;
  home?: string;
  kind: "preset" | "custom";
  quality?: string;
  mirrors?: string[];
};

const STORAGE_KEY = "grok-eye:radio-v1";

/** Public internet-radio presets. Audio is streamed from the stations, not hosted here. */
export const PRESET_STATIONS: RadioStation[] = [
  {
    id: "ccr",
    name: "Creedence",
    blurb: "Exclusively CCR. Fog on the river, globe in the windshield.",
    url: "https://streaming.exclusive.radio/er/creedence/icecast.audio",
    home: "https://exclusive.radio/",
    kind: "preset",
    quality: "128k MP3",
  },
  {
    id: "seventies",
    name: "Left Coast 70s",
    blurb: "Mellow album rock. Yacht not required.",
    url: "https://ice2.somafm.com/seventies-320-mp3",
    home: "https://somafm.com/seventies/",
    kind: "preset",
    quality: "320k MP3",
    mirrors: [
      "https://ice6.somafm.com/seventies-320-mp3",
      "https://ice5.somafm.com/seventies-320-mp3",
    ],
  },
  {
    id: "bootliquor",
    name: "Boot Liquor",
    blurb: "Americana for cowhands and cowtippers.",
    url: "https://ice2.somafm.com/bootliquor-320-mp3",
    home: "https://somafm.com/bootliquor/",
    kind: "preset",
    quality: "320k MP3",
    mirrors: [
      "https://ice6.somafm.com/bootliquor-320-mp3",
      "https://ice5.somafm.com/bootliquor-320-mp3",
    ],
  },
];

type RadioPersist = {
  custom: RadioStation[];
  lastId: string;
  volume: number;
};

type RadioState = {
  hydrated: boolean;
  picker: boolean;
  playing: boolean;
  volume: number;
  stationId: string;
  custom: RadioStation[];
  error: string;
  hydrate: () => void;
  setPicker: (v: boolean) => void;
  play: (id?: string) => void;
  pause: () => void;
  toggle: () => void;
  setVolume: (n: number) => void;
  setError: (s: string) => void;
  addCustom: (station: Omit<RadioStation, "kind">) => string | null;
  removeCustom: (id: string) => void;
};

function loadPersist(): RadioPersist {
  const fallback: RadioPersist = { custom: [], lastId: "ccr", volume: 0.72 };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<RadioPersist>;
    const custom = Array.isArray(parsed.custom)
      ? parsed.custom
          .filter(
            (s): s is RadioStation =>
              !!s &&
              typeof s.id === "string" &&
              typeof s.name === "string" &&
              typeof s.url === "string" &&
              s.url.startsWith("http"),
          )
          .slice(0, 12)
          .map((s) => ({ ...s, kind: "custom" as const }))
      : [];
    const volume =
      typeof parsed.volume === "number" && parsed.volume >= 0 && parsed.volume <= 1
        ? parsed.volume
        : 0.72;
    const lastId = typeof parsed.lastId === "string" ? parsed.lastId : "ccr";
    return { custom, lastId, volume };
  } catch {
    return fallback;
  }
}

function savePersist(s: Pick<RadioState, "custom" | "stationId" | "volume">) {
  if (typeof window === "undefined") return;
  try {
    const payload: RadioPersist = {
      custom: s.custom,
      lastId: s.stationId,
      volume: s.volume,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function allStations(custom: RadioStation[]): RadioStation[] {
  return [...PRESET_STATIONS, ...custom];
}

export function findStation(id: string, custom: RadioStation[]): RadioStation | undefined {
  return allStations(custom).find((s) => s.id === id);
}

export function stationPlayUrls(station: RadioStation): string[] {
  const extra = station.mirrors?.filter((u) => u && u !== station.url) ?? [];
  return [station.url, ...extra];
}

export const useRadio = create<RadioState>((set, get) => ({
  hydrated: false,
  picker: false,
  playing: false,
  volume: 0.72,
  stationId: "ccr",
  custom: [],
  error: "",
  hydrate: () => {
    if (get().hydrated) return;
    const p = loadPersist();
    const stationId = findStation(p.lastId, p.custom) ? p.lastId : "ccr";
    set({ hydrated: true, custom: p.custom, stationId, volume: p.volume });
  },
  setPicker: (picker) => set({ picker }),
  play: (id) => {
    const s = get();
    const stationId = id && findStation(id, s.custom) ? id : s.stationId;
    set({ playing: true, stationId, error: "" });
    savePersist({ ...get(), stationId });
  },
  pause: () => set({ playing: false }),
  toggle: () => {
    const s = get();
    if (s.playing) set({ playing: false });
    else get().play();
  },
  setVolume: (n) => {
    const volume = Math.min(1, Math.max(0, n));
    set({ volume });
    savePersist(get());
  },
  setError: (error) => set({ error, playing: error ? false : get().playing }),
  addCustom: (station) => {
    const url = station.url.trim();
    const name = station.name.trim().slice(0, 48);
    if (!name || !/^https?:\/\//i.test(url)) return "Need a name and an http(s) stream URL.";
    if (url.length > 500) return "URL is too long.";
    if (get().custom.length >= 12) return "Rack is full. Dump one first.";
    const id = station.id || `c-${Date.now().toString(36)}`;
    const next: RadioStation = {
      id,
      name,
      blurb: station.blurb.trim().slice(0, 80) || "Custom stream",
      url,
      home: station.home,
      kind: "custom",
    };
    set({ custom: [...get().custom, next], stationId: id });
    savePersist(get());
    return null;
  },
  removeCustom: (id) => {
    const custom = get().custom.filter((s) => s.id !== id);
    const stationId = get().stationId === id ? "ccr" : get().stationId;
    const playing = get().stationId === id ? false : get().playing;
    set({ custom, stationId, playing });
    savePersist(get());
  },
}));
