import { useEffect, useRef, useState } from "react";
import { Pause, Play, Plus, Radio, Trash2, X } from "lucide-react";
import { searchRadioStations } from "@/lib/feeds/radio";
import { createRadioChain, type RadioChain } from "@/lib/intel/audioChain";
import {
  PRESET_STATIONS,
  findStation,
  stationPlayUrls,
  useRadio,
  type RadioStation,
} from "@/lib/intel/radio";
import { flash } from "@/lib/intel/store";
import type { RadioSearchHit } from "@/lib/feeds/radio";

export function RadioDeck() {
  const picker = useRadio((s) => s.picker);
  const playing = useRadio((s) => s.playing);
  const volume = useRadio((s) => s.volume);
  const stationId = useRadio((s) => s.stationId);
  const custom = useRadio((s) => s.custom);
  const error = useRadio((s) => s.error);
  const audioRef = useRef<HTMLAudioElement>(null);
  const chainRef = useRef<RadioChain | null>(null);
  const lastKey = useRef("");
  const urlIndex = useRef(0);
  const suppressError = useRef(0);
  const station = findStation(stationId, custom) ?? PRESET_STATIONS[0];

  function ensureChain() {
    const el = audioRef.current;
    if (!el) return;
    if (!chainRef.current) {
      chainRef.current = createRadioChain(el);
      chainRef.current?.setVolume(useRadio.getState().volume);
    }
    void chainRef.current?.resume();
  }

  function tune(audio: HTMLAudioElement, url: string) {
    suppressError.current = Date.now() + 1200;
    audio.src = url;
    audio.preload = "auto";
    audio.load();
  }

  function playOrAdvance(audio: HTMLAudioElement, urls: string[]) {
    void audio.play().catch((err: unknown) => {
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError" || name === "NotAllowedError") return;
      const next = urlIndex.current + 1;
      if (next < urls.length) {
        urlIndex.current = next;
        tune(audio, urls[next]);
        playOrAdvance(audio, urls);
        return;
      }
      useRadio.getState().setError("Station's dead. Try another.");
      flash("Radio missed. Try another station.");
    });
  }

  useEffect(() => {
    useRadio.getState().hydrate();
    const prime = () => ensureChain();
    window.addEventListener("pointerdown", prime, { once: true });
    return () => window.removeEventListener("pointerdown", prime);
  }, []);

  useEffect(() => {
    if (chainRef.current) chainRef.current.setVolume(volume);
    else if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !station) return;
    if (!playing) {
      audio.pause();
      return;
    }
    ensureChain();
    const urls = stationPlayUrls(station);
    const key = `${station.id}:${station.url}`;
    if (lastKey.current !== key) {
      lastKey.current = key;
      urlIndex.current = 0;
      tune(audio, urls[0]);
    }
    playOrAdvance(audio, urls);
  }, [playing, station?.id, station?.url]);

  return (
    <>
      <audio
        ref={audioRef}
        preload="auto"
        playsInline
        onWaiting={() => {
          /* keep playing state; Icecast will refill */
        }}
        onStalled={() => {
          const audio = audioRef.current;
          if (!audio || !useRadio.getState().playing) return;
          if (Date.now() < suppressError.current) return;
          if (audio.readyState >= 2) return;
          const urls = station ? stationPlayUrls(station) : [];
          if (!urls.length) return;
          tune(audio, urls[urlIndex.current] ?? urls[0]);
          playOrAdvance(audio, urls);
        }}
        onError={() => {
          if (!useRadio.getState().playing) return;
          if (Date.now() < suppressError.current) return;
          const audio = audioRef.current;
          const urls = station ? stationPlayUrls(station) : [];
          const next = urlIndex.current + 1;
          if (audio && next < urls.length) {
            urlIndex.current = next;
            tune(audio, urls[next]);
            playOrAdvance(audio, urls);
            return;
          }
          useRadio.getState().setError("Stream failed.");
          flash("Radio stream failed.");
        }}
      />
      {picker && <RadioPicker station={station} custom={custom} error={error} />}
    </>
  );
}

function RadioPicker({
  station,
  custom,
  error,
}: {
  station: RadioStation;
  custom: RadioStation[];
  error: string;
}) {
  const playing = useRadio((s) => s.playing);
  const volume = useRadio((s) => s.volume);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<RadioSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;
    setSearching(true);
    try {
      const res = await searchRadioStations({ data: { q } });
      if (!res.ok) {
        flash(res.error);
        setHits([]);
      } else {
        setHits(res.hits);
        if (!res.hits.length) flash("Nothing in the directory.");
      }
    } catch {
      flash("Directory missed.");
    } finally {
      setSearching(false);
    }
  }

  function addCustom(e: React.FormEvent) {
    e.preventDefault();
    const err = useRadio.getState().addCustom({
      id: `c-${Date.now().toString(36)}`,
      name,
      url,
      blurb: "Your station",
    });
    if (err) {
      flash(err);
      return;
    }
    setName("");
    setUrl("");
    flash("Station added. Hit play.");
  }

  function addHit(hit: RadioSearchHit) {
    const err = useRadio.getState().addCustom({
      id: `c-${Date.now().toString(36)}`,
      name: hit.name,
      url: hit.url,
      blurb: hit.blurb,
      home: hit.home,
    });
    if (err) flash(err);
    else {
      flash(`Added ${hit.name}`);
      useRadio.getState().play(useRadio.getState().stationId);
    }
  }

  return (
    <aside
      className="panel radio-panel absolute top-32 right-3 left-3 z-20 overflow-y-auto p-3 sm:top-16 sm:left-auto md:top-20 md:right-4"
      role="dialog"
      aria-label="Radio tuner"
    >
      <header className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="kicker flex items-center gap-2">
            <Radio className="size-3" strokeWidth={1.75} />
            Lookin' out my back door
          </p>
          <h2 className="font-display text-xl font-semibold tracking-wide">Tuner</h2>
        </div>
        <button
          type="button"
          className="grid size-10 place-items-center text-muted"
          aria-label="Close tuner"
          onClick={() => useRadio.getState().setPicker(false)}
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="mb-3 flex items-center gap-2 rounded-sm bg-panel-2 p-2">
        <button
          type="button"
          className="grid size-11 place-items-center rounded-sm bg-accent text-accent-fg"
          aria-label={playing ? "Pause radio" : "Play radio"}
          onClick={() => useRadio.getState().toggle()}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-semibold tracking-wide">{station.name}</p>
          <p className="truncate text-xs text-muted">
            {error || [station.quality, station.blurb].filter(Boolean).join(" · ")}
          </p>
        </div>
        <label className="flex w-24 flex-col gap-1">
          <span className="kicker">Vol</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => useRadio.getState().setVolume(Number(e.target.value) / 100)}
            className="w-full accent-accent"
            aria-label="Volume"
          />
        </label>
      </div>

      <p className="kicker mb-1">Presets</p>
      <ul className="grid gap-1">
        {PRESET_STATIONS.map((s) => (
          <StationRow key={s.id} station={s} active={s.id === station.id} />
        ))}
      </ul>

      {custom.length > 0 && (
        <>
          <p className="kicker mt-3 mb-1">Your rack</p>
          <ul className="grid gap-1">
            {custom.map((s) => (
              <StationRow key={s.id} station={s} active={s.id === station.id} removable />
            ))}
          </ul>
        </>
      )}

      <p className="kicker mt-3 mb-1">Find a station</p>
      <form onSubmit={onSearch} className="flex gap-1">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the radio directory"
          className="min-h-11 min-w-0 flex-1 rounded-sm bg-panel-2 px-3 text-sm text-fg outline-none placeholder:text-subtle"
          aria-label="Search stations"
        />
        <button
          type="submit"
          disabled={searching}
          className="min-h-11 rounded-sm bg-panel-2 px-3 text-xs text-muted disabled:opacity-50"
        >
          {searching ? "…" : "Find"}
        </button>
      </form>
      {hits && hits.length > 0 && (
        <ul className="mt-1 grid gap-1">
          {hits.map((h) => (
            <li key={h.url}>
              <button
                type="button"
                onClick={() => addHit(h)}
                className="flex w-full min-h-11 items-center justify-between gap-2 rounded-sm bg-panel-2 px-2 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm">{h.name}</span>
                  <span className="block truncate text-xs text-subtle">{h.blurb}</span>
                </span>
                <Plus className="size-4 shrink-0 text-accent" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <details className="mt-3">
        <summary className="kicker cursor-pointer py-2">Or paste a stream</summary>
        <form onSubmit={addCustom} className="mt-1 grid gap-1">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="min-h-11 rounded-sm bg-panel-2 px-3 text-sm text-fg outline-none placeholder:text-subtle"
          maxLength={48}
          aria-label="Station name"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://… mp3 or aac stream"
          className="min-h-11 rounded-sm bg-panel-2 px-3 text-sm text-fg outline-none placeholder:text-subtle"
          maxLength={500}
          aria-label="Stream URL"
        />
        <button
          type="submit"
          className="flex min-h-11 items-center justify-center gap-2 rounded-sm bg-panel-2 text-sm text-fg"
        >
          <Plus className="size-4" strokeWidth={1.75} />
          Add to rack
        </button>
      </form>
      </details>

      <p className="mt-3 text-xs leading-snug text-subtle">
        Streams come from the stations, not us. CCR:{" "}
        <a
          href="https://exclusive.radio/"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-line underline-offset-2 hover:text-fg"
        >
          Exclusive Radio
        </a>
        . 70s:{" "}
        <a
          href="https://somafm.com/"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-line underline-offset-2 hover:text-fg"
        >
          SomaFM
        </a>
        .
      </p>
    </aside>
  );
}

function StationRow({
  station,
  active,
  removable,
}: {
  station: RadioStation;
  active: boolean;
  removable?: boolean;
}) {
  const playing = useRadio((s) => s.playing);
  return (
    <li className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => useRadio.getState().play(station.id)}
        className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-sm px-2 text-left ${
          active ? "bg-accent-dim" : "bg-panel-2 hover:text-fg"
        }`}
      >
        <span className="live-dot" data-state={active && playing ? "live" : "off"} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{station.name}</span>
          <span className="block truncate text-xs text-subtle">
            {[station.quality, station.blurb].filter(Boolean).join(" · ")}
          </span>
        </span>
      </button>
      {removable && (
        <button
          type="button"
          className="grid size-11 place-items-center text-muted"
          aria-label={`Remove ${station.name}`}
          onClick={() => useRadio.getState().removeCustom(station.id)}
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </li>
  );
}
