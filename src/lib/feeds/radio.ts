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

async function searchBrowser(q: string): Promise<BrowserStation[]> {
  const url =
    `https://de1.api.radio-browser.info/json/stations/search?hidebroken=true&limit=30&order=clickcount&reverse=true&name=${encodeURIComponent(q)}`;
  return fetchJson<BrowserStation[]>(url, {
    timeoutMs: 9000,
    headers: { "User-Agent": "GroksEyeView/1.0" },
  });
}

export const searchRadioStations = createServerFn({ method: "POST" })
  .validator((input: { q: string }) => input)
  .handler(async ({ data }): Promise<{ ok: true; hits: RadioSearchHit[] } | { ok: false; error: string }> => {
    const q = data.q.trim().slice(0, 80);
    if (q.length < 2) return { ok: false, error: "Type a bit more." };
    try {
      const hits = await cached(`radio:${q.toLowerCase()}`, 30 * 60 * 1000, async () => {
        const rows = await searchBrowser(q);
        const scored = (rows ?? [])
          .map((row) => {
            const hit = asHit(row);
            if (!hit) return null;
            const br = Math.min(320, Math.max(0, row.bitrate ?? 0));
            if (br > 0 && br < 64) return null;
            const codec = (row.codec ?? "").toUpperCase();
            const codecBonus = codec.includes("AAC") ? 48 : codec === "MP3" ? 16 : 0;
            return { hit, score: br + codecBonus };
          })
          .filter((x): x is { hit: RadioSearchHit; score: number } => !!x)
          .sort((a, b) => b.score - a.score);
        const out: RadioSearchHit[] = [];
        const seen = new Set<string>();
        for (const row of scored) {
          if (seen.has(row.hit.url)) continue;
          seen.add(row.hit.url);
          out.push(row.hit);
          if (out.length >= 8) break;
        }
        return out;
      });
      return { ok: true, hits };
    } catch {
      return { ok: false, error: "Directory missed. Paste a stream URL instead." };
    }
  });

export const readNowPlaying = createServerFn({ method: "POST" })
  .validator((input: { url: string }) => input)
  .handler(async ({ data }): Promise<{ title: string }> => {
    const url = data.url.trim();
    if (!url.startsWith("https://") || url.length > 500) return { title: "" };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          "Icy-MetaData": "1",
          "User-Agent": "GroksEyeView/1.0",
        },
      });
      if (!res.ok || !res.body) return { title: "" };
      const metaint = Number(res.headers.get("icy-metaint") || 0);
      if (!Number.isFinite(metaint) || metaint < 16 || metaint > 64_000) {
        ctrl.abort();
        return { title: "" };
      }
      const reader = res.body.getReader();
      const need = metaint + 1 + 4080;
      const chunks: Uint8Array[] = [];
      let got = 0;
      while (got < need) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        got += value.length;
      }
      await reader.cancel().catch(() => {});
      ctrl.abort();
      const buf = new Uint8Array(got);
      let off = 0;
      for (const c of chunks) {
        buf.set(c, off);
        off += c.length;
      }
      const lenByte = buf[metaint];
      if (!lenByte) return { title: "" };
      const start = metaint + 1;
      const end = Math.min(buf.length, start + lenByte * 16);
      const text = new TextDecoder("latin1").decode(buf.slice(start, end));
      const m = /StreamTitle='([^']*)'/.exec(text);
      return { title: (m?.[1] || "").trim().slice(0, 96) };
    } catch {
      return { title: "" };
    } finally {
      clearTimeout(timer);
    }
  });
