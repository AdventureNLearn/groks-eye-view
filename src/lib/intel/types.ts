export type LayerId =
  | "flights"
  | "military"
  | "vessels"
  | "satellites"
  | "earthquakes"
  | "fires"
  | "launches";

export type StyleId = "normal" | "crt" | "nvg" | "flir" | "noir" | "snow";

export type MapSourceId = "satellite" | "streets" | "night";

export type SceneId = "orbital" | "night" | "fire";

export type Freshness = "live" | "delayed" | "simulated" | "off" | "error";

export type Kind = "flight" | "military" | "vessel" | "satellite" | "earthquake" | "fire" | "launch";

export type Contact = {
  id: string;
  kind: Kind;
  name: string;
  meta: string;
  lat: number;
  lon: number;
  altM: number;
  heading: number;
  speedMs: number;
  vertMs: number;
  onGround?: boolean;
  country?: string;
  source: string;
  freshness: Freshness;
  extra?: Record<string, string | number>;
};

export type FlightSample = {
  id: string;
  callsign: string;
  origin: string;
  lat: number;
  lon: number;
  altM: number;
  heading: number;
  speedMs: number;
  vertMs: number;
  onGround: boolean;
  military: boolean;
  ts: number;
};

/** Serializable CelesTrak OMM subset used by json2satrec. */
export type SatOmm = {
  OBJECT_NAME: string;
  OBJECT_ID: string;
  NORAD_CAT_ID: number;
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  BSTAR: number;
  MEAN_MOTION_DOT: number;
  MEAN_MOTION_DDOT: number;
  EPHEMERIS_TYPE: number;
  CLASSIFICATION_TYPE: string;
  ELEMENT_SET_NO: number;
  REV_AT_EPOCH: number;
};

export type SatCatalogItem = {
  id: string;
  name: string;
  norad: number;
  group: string;
  rec: SatOmm;
};

export type QuakeSample = {
  id: string;
  title: string;
  mag: number;
  lat: number;
  lon: number;
  depthKm: number;
  ts: number;
  url: string;
};

export type FireSample = {
  id: string;
  title: string;
  lat: number;
  lon: number;
  source: string;
};

export type LaunchSample = {
  id: string;
  name: string;
  provider: string;
  pad: string;
  lat: number;
  lon: number;
  net: string;
  status: string;
};

export type Tracked = Contact;

export type DetectionBox = {
  x: number;
  y: number;
  label: string;
  kind: Kind;
};

export type VoiceAction = {
  type: string;
  q?: string;
  kind?: string;
  on?: boolean;
  style?: string;
  id?: string;
};

export type CommandAction =
  | { type: "flyTo"; q: string }
  | { type: "flyToCoord"; lat: number; lon: number; height?: number; name?: string }
  | { type: "trackNearest"; kind: "flight" | "vessel" | "satellite" | "iss" }
  | { type: "cockpit"; on: boolean }
  | { type: "style"; style: StyleId }
  | { type: "layer"; id: LayerId; on: boolean }
  | { type: "reset" }
  | { type: "hud"; on: boolean }
  | { type: "detection"; on: boolean }
  | { type: "count"; kind: "flights" | "vessels" | "satellites" }
  | { type: "scene"; id: SceneId }
  | { type: "next" }
  | { type: "unknown"; text: string };

export type EngineApi = {
  flyTo: (lon: number, lat: number, heightM: number, duration?: number) => void;
  resetGlobe: () => void;
  track: (id: string | null) => void;
  trackNearest: (kind: "flight" | "vessel" | "satellite" | "iss") => boolean;
  enterCockpit: (on: boolean) => void;
  setStyle: (style: StyleId) => void;
  setMapSource: (source: MapSourceId) => void;
  nextContact: () => void;
  lookupPlace: (q: string) => Promise<boolean>;
};

export const LAYER_META: Record<
  LayerId,
  { label: string; short: string; source: string; freshness: Freshness }
> = {
  flights: { label: "Live flights", short: "FLT", source: "OpenSky / adsb.lol", freshness: "live" },
  military: { label: "Military ADS-B", short: "MIL", source: "adsb.lol", freshness: "live" },
  vessels: { label: "Vessels", short: "AIS", source: "Modeled shipping lanes", freshness: "simulated" },
  satellites: { label: "Satellites", short: "SAT", source: "CelesTrak SGP4", freshness: "live" },
  earthquakes: { label: "Earthquakes", short: "EQ", source: "USGS 24h", freshness: "live" },
  fires: { label: "Active fires", short: "FIR", source: "NASA EONET", freshness: "live" },
  launches: { label: "Space missions", short: "MSN", source: "Launch Library 2", freshness: "live" },
};

export const STYLE_META: { id: StyleId; label: string; key: string }[] = [
  { id: "normal", label: "Normal", key: "1" },
  { id: "crt", label: "CRT", key: "2" },
  { id: "nvg", label: "NVG", key: "3" },
  { id: "flir", label: "FLIR", key: "4" },
  { id: "noir", label: "Noir", key: "5" },
  { id: "snow", label: "Snow", key: "6" },
];

export const SCENE_META: { id: SceneId; label: string }[] = [
  { id: "orbital", label: "Stare at space" },
  { id: "night", label: "Night goggles" },
  { id: "fire", label: "It's fine" },
];
