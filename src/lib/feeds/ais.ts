import { createServerFn } from "@tanstack/react-start";
import { simulatedVessels } from "@/lib/intel/vessels";
import type { Contact } from "@/lib/intel/types";

type Snapshot = { vessels: Contact[]; source: string; freshness: "live" | "simulated"; at: number };

const cache: Snapshot = {
  vessels: [],
  source: "Modeled shipping lanes",
  freshness: "simulated",
  at: 0,
};

let socket: WebSocket | null = null;
let started = false;
let usedKey = "";

function asContact(mmsi: string, lat: number, lon: number, heading: number, name: string, sog: number): Contact {
  return {
    id: `ais-${mmsi}`,
    kind: "vessel",
    name: name || `MMSI ${mmsi}`,
    meta: "AIS live",
    lat,
    lon,
    altM: 0,
    heading,
    speedMs: sog * 0.514444,
    vertMs: 0,
    source: "AISStream",
    freshness: "live",
  };
}

function startAis(userKey?: string): void {
  const key = (userKey || process.env.AISSTREAM_API_KEY || "").trim();
  if (!key) return;
  if (started && usedKey === key && socket) return;
  try {
    socket?.close();
  } catch {
    /* ignore */
  }
  started = true;
  usedKey = key;
  const live = new Map<string, Contact>();

  const connect = () => {
    try {
      const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");
      socket = ws;
      ws.addEventListener("open", () => {
        ws.send(
          JSON.stringify({
            APIKey: key,
            BoundingBoxes: [
              [[24, -82], [45, -66]],
              [[32, -125], [49, -116]],
              [[48, -6], [59, 12]],
              [[1, 103], [7, 109]],
              [[30, 120], [41, 142]],
              [[-36, 150], [-32, 154]],
            ],
            FilterMessageTypes: ["PositionReport"],
          }),
        );
      });
      ws.addEventListener("message", (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as {
            MessageType?: string;
            MetaData?: { MMSI?: number | string; latitude?: number; longitude?: number; ShipName?: string };
            Message?: { PositionReport?: { Cog?: number; Sog?: number; Latitude?: number; Longitude?: number } };
          };
          const meta = msg.MetaData;
          const pr = msg.Message?.PositionReport;
          if (!meta || !pr) return;
          const lat = Number(pr.Latitude ?? meta.latitude);
          const lon = Number(pr.Longitude ?? meta.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
          const mmsi = String(meta.MMSI ?? "");
          if (!mmsi) return;
          live.set(
            mmsi,
            asContact(
              mmsi,
              lat,
              lon,
              Number(pr.Cog ?? 0) || 0,
              String(meta.ShipName ?? "").trim(),
              Number(pr.Sog ?? 0) || 0,
            ),
          );
          if (live.size > 280) {
            const first = live.keys().next().value;
            if (first) live.delete(first);
          }
          cache.vessels = [...live.values()];
          cache.source = "AISStream live";
          cache.freshness = "live";
          cache.at = Date.now();
        } catch {
          /* ignore a bad frame */
        }
      });
      ws.addEventListener("close", () => {
        socket = null;
        setTimeout(connect, 8_000);
      });
      ws.addEventListener("error", () => {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
      });
    } catch {
      started = false;
    }
  };
  connect();
}

export const getVessels = createServerFn({ method: "POST" })
  .validator((input: { aisKey?: string } | undefined) => ({
    aisKey: String(input?.aisKey ?? "").slice(0, 120),
  }))
  .handler(async ({ data }) => {
  startAis(data.aisKey);
  if (cache.freshness === "live" && cache.vessels.length > 8) {
    return cache;
  }
  return {
    vessels: simulatedVessels(),
    source: cache.freshness === "live" ? "AISStream warming up · modeled lanes" : "Modeled shipping lanes",
    freshness: "simulated" as const,
    at: Date.now(),
  };
});
