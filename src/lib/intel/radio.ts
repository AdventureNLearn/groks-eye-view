import { create } from "zustand";

export type RadioGroup = "swamp" | "classic" | "mix";

export type RadioStation = {
  id: string;
  name: string;
  blurb: string;
  url: string;
  home?: string;
  kind: "preset" | "custom";
  quality?: string;
  mirrors?: string[];
  group?: RadioGroup;
  aliases?: string[];
};

const STORAGE_KEY = "grok-eye:radio-v1";

function er(slug: string): string {
  return `https://streaming.exclusive.radio/er/${slug}/icecast.audio`;
}

function exclusive(
  id: string,
  name: string,
  blurb: string,
  slug: string,
  group: RadioGroup,
  aliases: string[] = [],
): RadioStation {
  return {
    id,
    name,
    blurb,
    url: er(slug),
    home: "https://exclusive.radio/",
    kind: "preset",
    quality: "128k MP3",
    group,
    aliases,
  };
}

/** Public internet-radio presets. Audio is streamed from the stations, not hosted here. */
export const PRESET_STATIONS: RadioStation[] = [
  exclusive("ccr", "Creedence", "Fog on the river, globe in the windshield.", "creedence", "swamp", [
    "ccr",
    "creedence",
    "swamp rock",
  ]),
  exclusive("skynyrd", "Skynyrd", "Sweet home, no GPS required.", "lynyrdskynyrd", "swamp", [
    "lynyrd",
    "skynyrd",
  ]),
  exclusive("allman", "Allman Brothers", "Peach state slide guitar.", "allmanbrothers", "swamp", [
    "allman",
  ]),
  exclusive("zztop", "ZZ Top", "Beards, dust, and a little more cowbell.", "zztop", "swamp", [
    "zz top",
  ]),
  exclusive("theband", "The Band", "The night they drove old Dixie down.", "theband", "swamp", []),
  exclusive("neilyoung", "Neil Young", "Rust never sleeps. The globe does not either.", "neilyoung", "swamp", [
    "neil young",
  ]),
  exclusive("csny", "CSNY", "Four-part harmony, one long highway.", "csny", "swamp", [
    "crosby",
    "stills",
    "nash",
  ]),
  exclusive("cash", "Johnny Cash", "The man in black, still walking.", "johnnycash", "swamp", [
    "johnny cash",
    "cash",
  ]),
  exclusive("dylan", "Bob Dylan", "Tangled up in the ionosphere.", "bobdylan", "swamp", [
    "dylan",
    "bob dylan",
  ]),
  exclusive("petty", "Tom Petty", "Even the losers get lucky with a globe.", "tompetty", "swamp", [
    "petty",
    "tom petty",
  ]),
  exclusive("floyd", "Pink Floyd", "Comfortably numb over the Pacific.", "pinkfloyd", "classic", [
    "pink floyd",
    "floyd",
  ]),
  exclusive("zeppelin", "Led Zeppelin", "Stairway, no elevators.", "ledzeppelin", "classic", [
    "zeppelin",
    "zoso",
  ]),
  exclusive("stones", "Rolling Stones", "Gimme shelter, keep the globe spinning.", "rollingstones", "classic", [
    "stones",
    "rolling stones",
  ]),
  exclusive("beatles", "The Beatles", "Across the universe, literally.", "beatles", "classic", [
    "beatles",
  ]),
  exclusive("eagles", "Eagles", "Hotel California has a window seat.", "eagles", "classic", []),
  exclusive("fleetwood", "Fleetwood Mac", "Landslide, but make it orbital.", "fleetwoodmac", "classic", [
    "fleetwood",
    "stevie nicks",
  ]),
  exclusive("dead", "Grateful Dead", "A long, strange trip around Earth.", "gratefuldead", "classic", [
    "grateful dead",
    "the dead",
  ]),
  exclusive("queen", "Queen", "Is this the real life. Yes. It is a globe.", "queen", "classic", []),
  exclusive("bowie", "Bowie", "Ground control to the HUD.", "davidbowie", "classic", [
    "bowie",
    "david bowie",
  ]),
  exclusive("boss", "Springsteen", "Born to run the command bar.", "springsteen", "classic", [
    "springsteen",
    "the boss",
  ]),
  exclusive("seger", "Bob Seger", "Night moves over the Midwest.", "bobseger", "classic", [
    "seger",
    "bob seger",
  ]),
  {
    id: "seventies",
    name: "Left Coast 70s",
    blurb: "Mellow album rock. Yacht not required.",
    url: "https://ice2.somafm.com/seventies-320-mp3",
    home: "https://somafm.com/seventies/",
    kind: "preset",
    quality: "320k MP3",
    group: "mix",
    aliases: ["70s", "seventies", "left coast"],
    mirrors: [
      "https://ice6.somafm.com/seventies-320-mp3",
      "https://ice5.somafm.com/seventies-320-mp3",
      "https://ice2.somafm.com/seventies-128-mp3",
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
    group: "mix",
    aliases: ["boot liquor", "americana"],
    mirrors: [
      "https://ice6.somafm.com/bootliquor-320-mp3",
      "https://ice5.somafm.com/bootliquor-320-mp3",
      "https://ice2.somafm.com/bootliquor-128-mp3",
    ],
  },
];

export const PRESET_GROUPS: { id: RadioGroup; label: string }[] = [
  { id: "swamp", label: "Swamp & dirt" },
  { id: "classic", label: "Classic rock" },
  { id: "mix", label: "Mixes" },
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
  buffering: boolean;
  volume: number;
  stationId: string;
  custom: RadioStation[];
  error: string;
  nowPlaying: string;
  hydrate: () => void;
  setPicker: (v: boolean) => void;
  play: (id?: string) => void;
  pause: () => void;
  toggle: () => void;
  setVolume: (n: number) => void;
  setError: (s: string) => void;
  setNowPlaying: (s: string) => void;
  setBuffering: (v: boolean) => void;
  addCustom: (station: Omit<RadioStation, "kind">) => string | null;
  removeCustom: (id: string) => void;
};

function loadPersist(): RadioPersist {
  const fallback: RadioPersist = { custom: [], lastId: "ccr", volume: 0.78 };
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
        : 0.78;
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

export function matchStation(text: string, custom: RadioStation[] = []): RadioStation | undefined {
  const q = text.trim().toLowerCase();
  if (!q) return undefined;
  return allStations(custom).find((s) => {
    if (s.id === q || s.name.toLowerCase() === q) return true;
    return (s.aliases ?? []).some((a) => a.toLowerCase() === q || q.includes(a.toLowerCase()));
  });
}

export function stationPlayUrls(station: RadioStation): string[] {
  const extra = station.mirrors?.filter((u) => u && u !== station.url) ?? [];
  return [station.url, ...extra];
}

export const useRadio = create<RadioState>((set, get) => ({
  hydrated: false,
  picker: false,
  playing: false,
  buffering: false,
  volume: 0.78,
  stationId: "ccr",
  custom: [],
  error: "",
  nowPlaying: "",
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
    const switched = stationId !== s.stationId;
    set({
      playing: true,
      stationId,
      error: "",
      buffering: true,
      nowPlaying: switched ? "" : s.nowPlaying,
    });
    savePersist({ ...get(), stationId });
  },
  pause: () => set({ playing: false, buffering: false }),
  toggle: () => {
    const s = get();
    if (s.playing) set({ playing: false, buffering: false });
    else get().play();
  },
  setVolume: (n) => {
    const volume = Math.min(1, Math.max(0, n));
    set({ volume });
    savePersist(get());
  },
  setError: (error) => set({ error, playing: error ? false : get().playing, buffering: false }),
  setNowPlaying: (nowPlaying) => set({ nowPlaying }),
  setBuffering: (buffering) => set({ buffering }),
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
