import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export type GlobeContext = {
  place: string;
  style: string;
  cam: { lat: number; lon: number; height: number };
  tracked: {
    kind: string;
    name: string;
    meta: string;
    lat: number;
    lon: number;
    altM: number;
    heading: number;
    speedMs: number;
    source: string;
    freshness: string;
  } | null;
  weather: { temp: string; wind: string; sky: string } | null;
  layers: { id: string; on: boolean; count: number; detail: string }[];
  radio: { station: string; playing: boolean } | null;
};

type ChatTurn = { role: "user" | "assistant"; content: string };

const buckets = new Map<string, { n: number; t: number }>();

function clientKey() {
  try {
    const req = getRequest();
    const xf = req.headers.get("x-forwarded-for");
    if (xf) return xf.split(",")[0]?.trim() || "anon";
    return req.headers.get("x-real-ip") || "anon";
  } catch {
    return "anon";
  }
}

function allow(ip: string) {
  const now = Date.now();
  const b = buckets.get(ip);
  if (!b || now - b.t > 10 * 60_000) {
    buckets.set(ip, { n: 1, t: now });
    return true;
  }
  if (b.n >= 24) return false;
  b.n += 1;
  return true;
}

const SYSTEM = `You are Grok, jump-seat operator in Grok's Eye View — a meme spy-satellite cockpit over a real 3D Earth. The feeds are public (ADS-B, CelesTrak, USGS, NASA EONET, Launch Library). Nothing here is classified. Not for navigation.

Vibe: dry, funny, useful, short. Sound like Grok. 1–3 tight paragraphs unless they ask for more. No markdown headings. No emoji spam. No fake "accessing satellites" theater.

Use the operator's current globe context (place, camera, tracked contact, layers, weather, radio). If they have a contact locked, talk about THAT object. If a feed is simulated or delayed, say so.

You may move the globe or punch the radio ONLY when they asked, by appending exactly one last line:
<<ACTION:{"type":"flyTo","q":"Tokyo"}>>
Allowed type values: flyTo (q), trackNearest (kind: flight|vessel|satellite|iss), style (style: normal|crt|nvg|flir|noir|snow), layer (id + on), cockpit (on), radio (id: station id such as ccr, skynyrd, floyd, zeppelin, cash, seventies, or next/prev; on), reset, next.
Do not emit ACTION for a normal question.

Radio: artist channels are Exclusive Radio public internet streams. Mixes are SomaFM. Not downloads. If they name a band on the rack, punch that station.`;

function clipContext(ctx: GlobeContext): GlobeContext {
  return {
    place: String(ctx.place ?? "Earth").slice(0, 80),
    style: String(ctx.style ?? "normal").slice(0, 16),
    cam: {
      lat: Number(ctx.cam?.lat) || 0,
      lon: Number(ctx.cam?.lon) || 0,
      height: Number(ctx.cam?.height) || 0,
    },
    tracked: ctx.tracked
      ? {
          kind: String(ctx.tracked.kind).slice(0, 24),
          name: String(ctx.tracked.name).slice(0, 80),
          meta: String(ctx.tracked.meta).slice(0, 160),
          lat: Number(ctx.tracked.lat) || 0,
          lon: Number(ctx.tracked.lon) || 0,
          altM: Number(ctx.tracked.altM) || 0,
          heading: Number(ctx.tracked.heading) || 0,
          speedMs: Number(ctx.tracked.speedMs) || 0,
          source: String(ctx.tracked.source).slice(0, 80),
          freshness: String(ctx.tracked.freshness).slice(0, 24),
        }
      : null,
    weather: ctx.weather,
    layers: (ctx.layers ?? []).slice(0, 8).map((l) => ({
      id: String(l.id).slice(0, 24),
      on: Boolean(l.on),
      count: Number(l.count) || 0,
      detail: String(l.detail ?? "").slice(0, 80),
    })),
    radio: ctx.radio
      ? { station: String(ctx.radio.station).slice(0, 48), playing: Boolean(ctx.radio.playing) }
      : null,
  };
}

export const askGrok = createServerFn({ method: "POST" })
  .validator((input: { messages: ChatTurn[]; context: GlobeContext }) => input)
  .handler(async ({ data }): Promise<{ ok: true; text: string } | { ok: false; error: string }> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false, error: "Comms are dark in this environment. The globe still works." };
    if (!allow(clientKey())) return { ok: false, error: "Comms are busy. Give it a few minutes." };

    const messages = (data.messages ?? [])
      .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 500) }));
    if (!messages.length || messages[messages.length - 1]?.role !== "user") {
      return { ok: false, error: "Say something first." };
    }

    const ctx = clipContext(data.context);
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 420,
        temperature: 0.85,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "system",
            content: `Current globe: ${JSON.stringify(ctx)}`,
          },
          ...messages,
        ],
      }),
    });
    if (!res.ok) {
      if (res.status === 429) return { ok: false, error: "Grok's queue is full. Try again in a bit." };
      return { ok: false, error: `Comms error ${res.status}` };
    }
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = body.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return { ok: false, error: "Grok stared into space and said nothing." };
    return { ok: true, text: text.slice(0, 4000) };
  });
