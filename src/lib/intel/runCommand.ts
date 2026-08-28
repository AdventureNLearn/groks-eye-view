import { parseCommand } from "./commands";
import { playScene } from "./scenes";
import { flash, useIntel } from "./store";
import { useRadio } from "./radio";
import { interpretCommand } from "@/lib/feeds/world";
import {
  LAYER_META,
  type CommandAction,
  type LayerId,
  type SceneId,
  type StyleId,
  type VoiceAction,
} from "./types";

function isLayer(v: unknown): v is LayerId {
  return typeof v === "string" && v in LAYER_META;
}

function isStyle(v: unknown): v is StyleId {
  return (
    v === "normal" ||
    v === "crt" ||
    v === "nvg" ||
    v === "flir" ||
    v === "noir" ||
    v === "snow"
  );
}

function isScene(v: unknown): v is SceneId {
  return v === "orbital" || v === "night" || v === "fire";
}

function fromUnknown(raw: VoiceAction): CommandAction {
  const type = raw.type || "unknown";
  if (type === "flyTo") return { type: "flyTo", q: String(raw.q ?? "") };
  if (type === "trackNearest") {
    const kind = raw.kind;
    if (kind === "flight" || kind === "vessel" || kind === "satellite" || kind === "iss") {
      return { type: "trackNearest", kind };
    }
  }
  if (type === "cockpit") return { type: "cockpit", on: Boolean(raw.on) };
  if (type === "style" && isStyle(raw.style)) return { type: "style", style: raw.style };
  if (type === "layer" && isLayer(raw.id)) return { type: "layer", id: raw.id, on: Boolean(raw.on) };
  if (type === "reset") return { type: "reset" };
  if (type === "hud") return { type: "hud", on: Boolean(raw.on) };
  if (type === "detection") return { type: "detection", on: Boolean(raw.on) };
  if (type === "scene" && isScene(raw.id)) return { type: "scene", id: raw.id };
  if (type === "next") return { type: "next" };
  if (type === "radio") {
    return { type: "radio", id: typeof raw.id === "string" ? raw.id : undefined, on: raw.on };
  }
  if (type === "count" && (raw.kind === "flights" || raw.kind === "vessels" || raw.kind === "satellites")) {
    return { type: "count", kind: raw.kind };
  }
  return { type: "unknown", text: String(raw.q ?? "") };
}

export async function runCommand(text: string) {
  const engine = useIntel.getState().engine;
  if (!engine) return;
  let action = parseCommand(text);
  if (action.type === "unknown") {
    try {
      const ai = await interpretCommand({ data: { text } });
      if (ai.ok) action = fromUnknown(ai.action);
    } catch {
      /* local only */
    }
  }
  await applyAction(action, text);
}

export async function applyAction(action: CommandAction, raw = "") {
  const s = useIntel.getState();
  const engine = s.engine;
  if (action.type === "radio") {
    if (action.on === false) {
      useRadio.getState().pause();
      flash("Radio off");
    } else {
      useRadio.getState().play(action.id);
      const id = action.id ?? useRadio.getState().stationId;
      flash(id === "ccr" ? "Creedence on the wire" : "Radio on");
    }
    return;
  }
  if (!engine) return;

  switch (action.type) {
    case "reset":
      engine.resetGlobe();
      flash("Full globe");
      break;
    case "flyTo":
      await engine.lookupPlace(action.q);
      break;
    case "flyToCoord":
      engine.flyTo(action.lon, action.lat, action.height ?? 80_000);
      if (action.name) s.setPlace(action.name);
      break;
    case "style":
      engine.setStyle(action.style);
      flash(`Style · ${action.style.toUpperCase()}`);
      break;
    case "layer":
      s.setLayer(action.id, {
        on: action.on,
        freshness: action.on ? LAYER_META[action.id].freshness : "off",
      });
      flash(`${LAYER_META[action.id].label} ${action.on ? "on" : "off"}`);
      break;
    case "trackNearest": {
      const need: LayerId =
        action.kind === "vessel" ? "vessels" : action.kind === "flight" ? "flights" : "satellites";
      if (!s.layers[need].on) {
        s.setLayer(need, { on: true, freshness: LAYER_META[need].freshness });
        await new Promise((r) => setTimeout(r, 900));
      }
      const ok = engine.trackNearest(action.kind);
      flash(ok ? `Tracking nearest ${action.kind}` : `No ${action.kind} in catalog yet`);
      break;
    }
    case "cockpit":
      if (action.on && !s.tracked) {
        s.setLayer("flights", { on: true, freshness: "live" });
        await new Promise((r) => setTimeout(r, 800));
        engine.trackNearest("flight");
      }
      engine.enterCockpit(action.on);
      flash(action.on ? "Cockpit" : "Map view");
      break;
    case "hud":
      s.setHud(action.on);
      break;
    case "detection":
      s.setDetection(action.on);
      flash(action.on ? "Detection on" : "Detection off");
      break;
    case "scene":
      await playScene(action.id);
      break;
    case "next":
      engine.nextContact();
      break;
    case "count": {
      const n =
        s.layers[
          action.kind === "flights" ? "flights" : action.kind === "vessels" ? "vessels" : "satellites"
        ].count;
      flash(`${n} ${action.kind} currently drawn`);
      break;
    }
    case "unknown":
      flash(raw ? `Grok shrugged at “${raw}”. Try Tokyo.` : "Grok shrugged.");
      break;
  }
}
