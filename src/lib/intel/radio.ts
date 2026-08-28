import { create } from "zustand";
import { setPlayerVolume, startRadio, stopRadio } from "./radioPlayer";

export type RadioGroup = "swamp" | "classic" | "country" | "mix";

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
  exclusive("littlefeat", "Little Feat", "Dixie chicken, orbital gravy.", "littlefeat", "swamp", [
    "little feat",
  ]),
  exclusive("doobies", "Doobie Brothers", "Listen to the globe.", "doobiebrothers", "swamp", [
    "doobie",
    "doobies",
  ]),
  exclusive("miller", "Steve Miller", "The Joker, still in the air.", "stevemillerband", "swamp", [
    "steve miller",
  ]),
  exclusive("crowes", "Black Crowes", "Twice as hard, twice as high.", "theblackcrowes", "swamp", [
    "black crowes",
    "crowes",
  ]),
  exclusive("badco", "Bad Company", "Feel like making radio.", "badcompany", "swamp", [
    "bad company",
    "badco",
  ]),
  exclusive("airplane", "Jefferson Airplane", "White rabbit over the terminator.", "jeffersonairplane", "swamp", [
    "jefferson airplane",
    "airplane",
  ]),
  exclusive("santana", "Santana", "Oye como va, from orbit.", "santana", "swamp", []),
  exclusive("clapton", "Clapton", "Slowhand, fast globe.", "ericclapton", "swamp", [
    "clapton",
    "eric clapton",
  ]),
  exclusive("hendrix", "Hendrix", "Purple haze on the dayside.", "hendrix", "swamp", [
    "hendrix",
    "jimi",
  ]),
  exclusive("petty", "Tom Petty", "Even the losers get lucky with a globe.", "tompetty", "swamp", [
    "petty",
    "tom petty",
  ]),
  exclusive("neilyoung", "Neil Young", "Rust never sleeps. The globe does not either.", "neilyoung", "swamp", [
    "neil young",
  ]),
  exclusive("csny", "CSNY", "Four-part harmony, one long highway.", "csny", "swamp", [
    "crosby",
    "stills",
    "nash",
  ]),
  exclusive("floyd", "Pink Floyd", "Comfortably numb over the Pacific.", "pinkfloyd", "classic", [
    "pink floyd",
    "floyd",
  ]),
  exclusive("zeppelin", "Led Zeppelin", "Stairway, no elevators.", "ledzeppelin", "classic", [
    "zeppelin",
    "zoso",
    "led zeppelin",
  ]),
  exclusive("stones", "Rolling Stones", "Gimme shelter, keep the globe spinning.", "rollingstones", "classic", [
    "stones",
    "rolling stones",
  ]),
  exclusive("beatles", "The Beatles", "Across the universe, literally.", "beatles", "classic", []),
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
  exclusive("who", "The Who", "Teenage wasteland, global edition.", "thewho", "classic", [
    "the who",
  ]),
  exclusive("doors", "The Doors", "Break on through to the other hemisphere.", "doors", "classic", [
    "the doors",
  ]),
  exclusive("rush", "Rush", "Tom Sawyer would want a bigger map.", "rush", "classic", []),
  exclusive("straits", "Dire Straits", "Sultans of swing, still swinging.", "direstraits", "classic", [
    "dire straits",
  ]),
  exclusive("cream", "Cream", "Sunshine of your globe.", "cream", "classic", []),
  exclusive("boston", "Boston", "More than a feeling, less than Mach 1.", "boston", "classic", []),
  exclusive("journey", "Journey", "Don't stop, believing, orbiting.", "journey", "classic", []),
  exclusive("heart", "Heart", "Barracuda in the ionosphere.", "heart", "classic", []),
  exclusive("cash", "Johnny Cash", "The man in black, still walking.", "johnnycash", "country", [
    "johnny cash",
    "cash",
  ]),
  exclusive("dylan", "Bob Dylan", "Tangled up in the ionosphere.", "bobdylan", "country", [
    "dylan",
    "bob dylan",
  ]),
  exclusive("willie", "Willie Nelson", "On the road again, around the planet.", "willienelson", "country", [
    "willie",
    "willie nelson",
  ]),
  exclusive("waylon", "Waylon", "Ladies love outlaws. Globes do too.", "waylonjennings", "country", [
    "waylon",
  ]),
  exclusive("haggard", "Merle Haggard", "Working man, night shift over Kansas.", "merlehaggard", "country", [
    "haggard",
    "merle",
  ]),
  exclusive("hank", "Hank Williams", "I'm so lonesome I could fly.", "hankwilliams", "country", [
    "hank",
    "hank williams",
  ]),
  exclusive("jones", "George Jones", "He stopped loving her, we did not stop looking.", "georgejones", "country", [
    "george jones",
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
  { id: "swamp", label: "Swamp" },
  { id: "classic", label: "Classic" },
  { id: "country", label: "Country" },
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
  next: () => void;
  prev: () => void;
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
  const all = allStations(custom);
  const exact = all.find((s) => s.id === q || s.name.toLowerCase() === q);
  if (exact) return exact;
  return all.find((s) => {
    const keys = [s.name, s.id, ...(s.aliases ?? [])].map((a) => a.toLowerCase());
    return keys.some((k) => k.length >= 3 && (q === k || q.includes(k)));
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
    const st = findStation(stationId, s.custom);
    set({
      playing: true,
      stationId,
      error: "",
      buffering: true,
      nowPlaying: switched ? "" : s.nowPlaying,
    });
    savePersist({ ...get(), stationId });
    if (st) void startRadio(stationPlayUrls(st), get().volume);
  },
  pause: () => {
    set({ playing: false, buffering: false });
    stopRadio();
  },
  toggle: () => {
    const s = get();
    if (s.playing) get().pause();
    else get().play();
  },
  next: () => {
    const list = allStations(get().custom);
    if (!list.length) return;
    const i = list.findIndex((s) => s.id === get().stationId);
    const n = list[(i + 1) % list.length];
    get().play(n.id);
  },
  prev: () => {
    const list = allStations(get().custom);
    if (!list.length) return;
    const i = list.findIndex((s) => s.id === get().stationId);
    const n = list[(i - 1 + list.length) % list.length];
    get().play(n.id);
  },
  setVolume: (n) => {
    const volume = Math.min(1, Math.max(0, n));
    set({ volume });
    savePersist(get());
    setPlayerVolume(volume);
  },
  setError: (error) => {
    if (error) stopRadio();
    set({ error, playing: error ? false : get().playing, buffering: false });
  },
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
    const dropping = get().stationId === id;
    const custom = get().custom.filter((s) => s.id !== id);
    const stationId = dropping ? "ccr" : get().stationId;
    if (dropping) get().pause();
    set({ custom, stationId });
    savePersist(get());
  },
}));
