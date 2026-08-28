import type { CommandAction, LayerId, SceneId, StyleId } from "./types";

const LAYERS: { re: RegExp; id: LayerId }[] = [
  { re: /military|mil(?:itary)? (?:ads-?b|flights?|traffic)/i, id: "military" },
  { re: /flights?|aircraft|planes?|ads-?b/i, id: "flights" },
  { re: /vessels?|ships?|ais|maritime/i, id: "vessels" },
  { re: /satellites?|orbit/i, id: "satellites" },
  { re: /earthquakes?|seismic|quakes?/i, id: "earthquakes" },
  { re: /fires?|wildfires?|firms/i, id: "fires" },
  { re: /launches?|space missions?|rockets?/i, id: "launches" },
];

const STYLES: { re: RegExp; style: StyleId }[] = [
  { re: /\b(normal|optical|daylight|reset style)\b/i, style: "normal" },
  { re: /\b(crt|retro|scanline)\b/i, style: "crt" },
  { re: /\b(nvg|night vision|green)\b/i, style: "nvg" },
  { re: /\b(flir|thermal|ironbow)\b/i, style: "flir" },
  { re: /\b(noir|black and white|mono)\b/i, style: "noir" },
  { re: /\b(snow|winter|ice)\b/i, style: "snow" },
];

const SCENES: { re: RegExp; id: SceneId }[] = [
  { re: /orbital watch|show me space|space missions/i, id: "orbital" },
  { re: /night watch|night vision over/i, id: "night" },
  { re: /fire line|show me fires|wildfire/i, id: "fire" },
];

export function parseCommand(raw: string): CommandAction {
  const text = raw.trim();
  if (!text) return { type: "unknown", text };

  if (/^(reset|home|full globe|zoom out|globe view)\b/i.test(text)) {
    return { type: "reset" };
  }
  if (/\b(next contact|next aircraft|next plane)\b/i.test(text)) {
    return { type: "next" };
  }
  if (/\b(enter )?cockpit\b/i.test(text) && !/\bexit\b/i.test(text)) {
    return { type: "cockpit", on: true };
  }
  if (/\b(exit cockpit|leave cockpit|map view)\b/i.test(text)) {
    return { type: "cockpit", on: false };
  }
  if (/\b(hide hud|hud off)\b/i.test(text)) return { type: "hud", on: false };
  if (/\b(show hud|hud on)\b/i.test(text)) return { type: "hud", on: true };
  if (/\b(detection on|detect on|show detections?)\b/i.test(text)) {
    return { type: "detection", on: true };
  }
  if (/\b(detection off|detect off)\b/i.test(text)) return { type: "detection", on: false };

  for (const sc of SCENES) {
    if (sc.re.test(text)) return { type: "scene", id: sc.id };
  }

  for (const s of STYLES) {
    if (s.re.test(text) && /style|switch|set|mode|vision|to\b/i.test(text)) {
      return { type: "style", style: s.style };
    }
    if (s.re.test(text) && text.split(/\s+/).length <= 3) {
      return { type: "style", style: s.style };
    }
  }

  const on = /\b(on|enable|show|turn on|light up)\b/i.test(text);
  const off = /\b(off|disable|hide|turn off)\b/i.test(text);
  if (on || off) {
    for (const l of LAYERS) {
      if (l.re.test(text)) return { type: "layer", id: l.id, on };
    }
  }

  if (/\bhow many\b/i.test(text)) {
    if (/flight|plane|aircraft/i.test(text)) return { type: "count", kind: "flights" };
    if (/ship|vessel/i.test(text)) return { type: "count", kind: "vessels" };
    if (/sat/i.test(text)) return { type: "count", kind: "satellites" };
  }

  if (/\b(iss|international space station)\b/i.test(text) && /\b(track|follow|show|find)\b/i.test(text)) {
    return { type: "trackNearest", kind: "iss" };
  }
  if (/\btrack (the )?iss\b/i.test(text) || /^iss$/i.test(text)) {
    return { type: "trackNearest", kind: "iss" };
  }
  if (/\b(nearest|closest).*(ship|vessel)|track.*(ship|vessel)/i.test(text)) {
    return { type: "trackNearest", kind: "vessel" };
  }
  if (/\b(nearest|closest).*(sat)|track.*(sat)/i.test(text)) {
    return { type: "trackNearest", kind: "satellite" };
  }
  if (/\b(nearest|track).*(aircraft|flight|plane)|select the nearest/i.test(text)) {
    return { type: "trackNearest", kind: "flight" };
  }

  const go = text.match(
    /^(?:take me to|fly to|go to|show me|open|jump to|navigate to)\s+(.+)$/i,
  );
  if (go?.[1]) return { type: "flyTo", q: go[1].replace(/[?.!]+$/, "").trim() };

  const coord = text.match(/(-?\d{1,3}\.\d+)\s*[, ]\s*(-?\d{1,3}\.\d+)/);
  if (coord) {
    return { type: "flyToCoord", lat: Number(coord[1]), lon: Number(coord[2]) };
  }

  if (/^(tokyo|austin|lax|jfk|heathrow|singapore|dubai|sydney|iss|new york|nyc)$/i.test(text)) {
    return { type: "flyTo", q: text };
  }

  return { type: "unknown", text };
}
