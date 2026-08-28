import { createServerFn } from "@tanstack/react-start";
import { cached, fetchJson } from "./http";

type BrowserStation = {
  name?: string;
  url?: string;
  url_resolved?: string;
  homepage?: string;
  codec?: string;
  bitrate?: number;
  favicon?: string;
  countrycode?: string;
};

export type RadioSearchHit = {
  name: string;
  url: string;
  home?: string;
  blurb: string;
};

function asHit(row: BrowserStation): RadioSearchHit | null {
  const name = (row.name ?? "").trim();
  const raw = (row.url_resolved || row.url || "").trim();
  if (!name || !raw) return null;
  let url = raw;
  if (url.startsWith("http://")) url = `https://${url.slice(7)}`;
  if (!url.startsWith("https://")) return null;
  const codec = (row.codec ?? "").toUpperCase();
  const br = row.bitrate ? `${row.bitrate}k` : "";
  const cc = row.countrycode ? row.countrycode : "";
  const blurb = [codec, br, cc].filter(Boolean).join(" · ") || "Internet radio";
  return { name: name.slice(0, 64), url, home: row.homepage || undefined, blurb };
}

export const searchRadioStations = createServerFn({ method: "POST" })
  .validator((input: { q: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true; hits: RadioSearchHit[] } | { ok: false; error: string }> => {
    const q = data.q.trim().slice(0, 80);
    if (q.length < 2) return { ok: false, error: "Type a bit more." };
    try {
      const hits = await cached(`radio:${q.toLowerCase()}`, 30 * 60 * 1000, async () => {
        const url =
          `https://de1.api.radio-browser.info/json/stations/search?hidebroken=true&limit=12&order=clickcount&reverse=true&name=${encodeURIComponent(q)}`;
        const rows = await fetchJson<BrowserStation[]>(url, {
          timeoutMs: 9000,
          headers: { "User-Agent": "GroksEyeView/1.0" },
        });
        const out: RadioSearchHit[] = [];
        const seen = new Set<string>();
        for (const row of rows ?? []) {
          const hit = asHit(row);
          if (!hit || seen.has(hit.url)) continue;
          seen.add(hit.url);
          out.push(hit);
          if (out.length >= 5) break;
        }
        return out;
      });
      return { ok: true, hits };
    } catch {
      return { ok: false, error: "Directory missed. Paste a stream URL instead." };
    }
  });
