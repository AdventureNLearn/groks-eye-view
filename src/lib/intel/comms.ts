import { create } from "zustand";
import { askGrok } from "@/lib/feeds/chat";
import { findStation, useRadio } from "./radio";
import { flash, useIntel } from "./store";
import type { CommandAction, LayerId } from "./types";
import type { GlobeContext } from "@/lib/feeds/chat";

export type ChatMsg = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type CommsState = {
  open: boolean;
  pending: boolean;
  messages: ChatMsg[];
  draft: string;
  sent: number;
  setOpen: (v: boolean) => void;
  setDraft: (s: string) => void;
  send: (text?: string) => Promise<void>;
};

const GREETING: ChatMsg = {
  id: "greet",
  role: "assistant",
  text: "Comms up. I'm in the jump seat. Ask about a plane, the ISS, a city, or why this globe looks classified when it isn't. I can fly us somewhere. Creedence is on the other dial.",
};

function nid() {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function snapshot(): GlobeContext {
  const s = useIntel.getState();
  const r = useRadio.getState();
  const st = findStation(r.stationId, r.custom);
  const tracked = s.tracked
    ? {
        kind: s.tracked.kind,
        name: s.tracked.name,
        meta: s.tracked.meta,
        lat: s.tracked.lat,
        lon: s.tracked.lon,
        altM: s.tracked.altM,
        heading: s.tracked.heading,
        speedMs: s.tracked.speedMs,
        source: s.tracked.source,
        freshness: s.tracked.freshness,
      }
    : null;
  const layers = (Object.keys(s.layers) as LayerId[]).map((id) => ({
    id,
    on: s.layers[id].on,
    count: s.layers[id].count,
    detail: s.layers[id].detail,
  }));
  return {
    place: s.placeName,
    style: s.style,
    cam: s.cam,
    tracked,
    weather: s.weather,
    layers,
    radio: st ? { station: st.name, playing: r.playing } : null,
  };
}

export function suggestionChips(): string[] {
  const s = useIntel.getState();
  const r = useRadio.getState();
  const chips: string[] = [];
  if (s.tracked) {
    chips.push(`What's the story on ${s.tracked.name}?`);
    if (s.tracked.kind === "flight" || s.tracked.kind === "military") {
      chips.push("How high is that actually?");
    }
    if (s.tracked.kind === "satellite") chips.push("How fast is that tin can?");
    if (s.tracked.kind === "earthquake") chips.push("How bad is this quake?");
    if (s.tracked.kind === "fire") chips.push("Is this fire actually a problem?");
  } else if (s.placeName && s.placeName !== "Earth") {
    chips.push(`What's the tea on ${s.placeName}?`);
    chips.push(`Anything flying over ${s.placeName}?`);
  } else {
    chips.push("What's the ISS doing right now?");
    chips.push("Roast this view.");
    chips.push("Why can anyone see these planes?");
  }
  if (!r.playing) chips.push("Put on Creedence.");
  return chips.slice(0, 4);
}

function parseTaggedAction(raw: string): { text: string; action: CommandAction | null } {
  const match = raw.match(/<<ACTION:(\{[\s\S]*?\})>>/);
  if (!match) return { text: raw.trim(), action: null };
  const text = raw.replace(match[0], "").trim();
  try {
    const o = JSON.parse(match[1]) as {
      type?: string;
      q?: string;
      kind?: string;
      on?: boolean;
      style?: string;
      id?: string;
    };
    const type = o.type ?? "";
    if (type === "flyTo" && o.q) return { text, action: { type: "flyTo", q: o.q } };
    if (type === "reset") return { text, action: { type: "reset" } };
    if (type === "next") return { text, action: { type: "next" } };
    if (type === "cockpit") return { text, action: { type: "cockpit", on: Boolean(o.on) } };
    if (
      type === "trackNearest" &&
      (o.kind === "flight" || o.kind === "vessel" || o.kind === "satellite" || o.kind === "iss")
    ) {
      return { text, action: { type: "trackNearest", kind: o.kind } };
    }
    if (
      type === "style" &&
      (o.style === "normal" ||
        o.style === "crt" ||
        o.style === "nvg" ||
        o.style === "flir" ||
        o.style === "noir" ||
        o.style === "snow")
    ) {
      return { text, action: { type: "style", style: o.style } };
    }
    if (type === "radio") {
      return { text, action: { type: "radio", id: typeof o.id === "string" ? o.id : undefined, on: o.on } };
    }
    if (
      type === "layer" &&
      (o.id === "flights" ||
        o.id === "military" ||
        o.id === "vessels" ||
        o.id === "satellites" ||
        o.id === "earthquakes" ||
        o.id === "fires" ||
        o.id === "launches")
    ) {
      return { text, action: { type: "layer", id: o.id, on: Boolean(o.on) } };
    }
    return { text, action: null };
  } catch {
    return { text, action: null };
  }
}

export const useComms = create<CommsState>((set, get) => ({
  open: false,
  pending: false,
  messages: [GREETING],
  draft: "",
  sent: 0,
  setOpen: (open) => set({ open }),
  setDraft: (draft) => set({ draft }),
  send: async (raw) => {
    const text = (raw ?? get().draft).trim();
    if (!text || get().pending) return;
    if (get().sent >= 24) {
      flash("That's enough chatter for this orbit.");
      return;
    }
    const user: ChatMsg = { id: nid(), role: "user", text: text.slice(0, 500) };
    const history = [...get().messages.filter((m) => m.id !== "greet"), user].slice(-8);
    set({
      draft: "",
      pending: true,
      sent: get().sent + 1,
      messages: [...get().messages, user],
    });
    const ctx = snapshot();
    try {
      const res = await askGrok({
        data: {
          messages: history.map((m) => ({ role: m.role, content: m.text })),
          context: ctx,
        },
      });
      if (!res.ok) {
        set({
          pending: false,
          messages: [
            ...get().messages,
            { id: nid(), role: "assistant", text: res.error || "Comms dropped." },
          ],
        });
        return;
      }
      const parsed = parseTaggedAction(res.text);
      set({
        pending: false,
        messages: [
          ...get().messages,
          { id: nid(), role: "assistant", text: parsed.text || "Copy that." },
        ],
      });
      if (parsed.action) {
        const { applyAction } = await import("./runCommand");
        await applyAction(parsed.action, text);
      }
    } catch {
      set({
        pending: false,
        messages: [
          ...get().messages,
          { id: nid(), role: "assistant", text: "Comms dropped. Globe still works." },
        ],
      });
    }
  },
}));
