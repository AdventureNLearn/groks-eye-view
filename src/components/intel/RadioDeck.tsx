import { useEffect, useState } from "react";
import { Pause, Play, Plus, Radio, SkipBack, SkipForward, Trash2, X } from "lucide-react";
import { readNowPlaying, searchRadioStations } from "@/lib/feeds/radio";
import { bindRadioPlayer } from "@/lib/intel/radioPlayer";
import {
  PRESET_GROUPS,
  PRESET_STATIONS,
  findStation,
  useRadio,
  type RadioGroup,
  type RadioStation,
} from "@/lib/intel/radio";
import { flash } from "@/lib/intel/store";
import type { RadioSearchHit } from "@/lib/feeds/radio";

export function RadioDeck() {
  const picker = useRadio((s) => s.picker);
  const playing = useRadio((s) => s.playing);
  const stationId = useRadio((s) => s.stationId);
  const custom = useRadio((s) => s.custom);
  const error = useRadio((s) => s.error);
  const station = findStation(stationId, custom) ?? PRESET_STATIONS[0];

  useEffect(() => {
    useRadio.getState().hydrate();
    bindRadioPlayer({
      onPlaying: () => useRadio.getState().setBuffering(false),
      onWaiting: () => {
        if (useRadio.getState().playing) useRadio.getState().setBuffering(true);
      },
      onFailed: (msg) => {
        useRadio.getState().setError(msg);
        flash(msg);
      },
    });
  }, []);

  useEffect(() => {
    if (!playing || !station) {
      useRadio.getState().setNowPlaying("");
      return;
    }
    let cancelled = false;
    const pull = async () => {
      try {
        const res = await readNowPlaying({ data: { url: station.url } });
        if (!cancelled && res.title) useRadio.getState().setNowPlaying(res.title);
      } catch {
        /* metadata is bonus */
      }
    };
    const wait = window.setTimeout(() => void pull(), 4000);
    const id = window.setInterval(pull, 15000);
    return () => {
      cancelled = true;
      window.clearTimeout(wait);
      window.clearInterval(id);
    };
  }, [playing, station?.id, station?.url]);

  return picker ? <RadioPicker station={station} custom={custom} error={error} /> : null;
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
  const buffering = useRadio((s) => s.buffering);
  const nowPlaying = useRadio((s) => s.nowPlaying);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<RadioSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [tab, setTab] = useState<RadioGroup | "rack">(station.group ?? "swamp");
  const [needle, setNeedle] = useState("");

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
    flash("Station added. Hitting play.");
    useRadio.getState().play(useRadio.getState().stationId);
    setTab("rack");
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
      setTab("rack");
    }
  }

  const subtitle =
    error ||
    (buffering ? "Tuning…" : nowPlaying) ||
    [station.quality, station.blurb].filter(Boolean).join(" · ");

  const q = needle.trim().toLowerCase();
  const filtered = (list: RadioStation[]) =>
    q
      ? list.filter((s) =>
          [s.name, s.id, s.blurb, ...(s.aliases ?? [])].join(" ").toLowerCase().includes(q),
        )
      : list;

  const tabRows =
    tab === "rack"
      ? filtered(custom)
      : filtered(PRESET_STATIONS.filter((s) => s.group === tab));
  const searchRows = q
    ? filtered([...PRESET_STATIONS, ...custom])
    : tabRows;

  return (
    <aside
      className="panel radio-panel absolute top-32 right-3 left-3 z-20 overflow-y-auto p-3 sm:top-16 sm:left-auto md:top-20 md:right-4"
      role="dialog"
      aria-label="Radio tuner"
    >
      <header className="mb-2 flex items-start justify-between gap-2">
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

      <div className="mb-3 flex items-center gap-1 rounded-sm bg-panel-2 p-2">
        <button
          type="button"
          className="grid size-10 place-items-center rounded-sm"
          aria-label="Previous station"
          onClick={() => useRadio.getState().prev()}
        >
          <SkipBack className="size-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="grid size-11 place-items-center rounded-sm bg-accent text-accent-fg"
          aria-label={playing ? "Pause radio" : "Play radio"}
          onClick={() => useRadio.getState().toggle()}
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </button>
        <button
          type="button"
          className="grid size-10 place-items-center rounded-sm"
          aria-label="Next station"
          onClick={() => useRadio.getState().next()}
        >
          <SkipForward className="size-4" strokeWidth={1.75} />
        </button>
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate font-display text-base font-semibold tracking-wide">{station.name}</p>
          <p className="truncate text-xs text-muted">{subtitle}</p>
        </div>
        <label className="flex w-20 flex-col gap-1">
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

      <input
        value={needle}
        onChange={(e) => setNeedle(e.target.value)}
        placeholder="Filter the rack"
        className="mb-2 min-h-11 w-full rounded-sm bg-panel-2 px-3 text-sm text-fg outline-none placeholder:text-subtle"
        aria-label="Filter stations"
      />

      {!q && (
        <div className="mb-2 flex flex-wrap gap-1">
          {PRESET_GROUPS.map((g) => (
            <button
              key={g.id}
              type="button"
              data-on={tab === g.id ? "true" : "false"}
              onClick={() => setTab(g.id)}
              className={`min-h-9 rounded-sm px-2 text-xs ${
                tab === g.id ? "bg-accent text-accent-fg" : "bg-panel-2 text-muted"
              }`}
            >
              {g.label}
            </button>
          ))}
          {custom.length > 0 && (
            <button
              type="button"
              onClick={() => setTab("rack")}
              className={`min-h-9 rounded-sm px-2 text-xs ${
                tab === "rack" ? "bg-accent text-accent-fg" : "bg-panel-2 text-muted"
              }`}
            >
              Yours
            </button>
          )}
        </div>
      )}

      <ul className="mb-3 grid grid-cols-2 gap-1">
        {searchRows.map((s) => (
          <StationRow key={s.id} station={s} active={s.id === station.id} removable={s.kind === "custom"} />
        ))}
      </ul>
      {searchRows.length === 0 && (
        <p className="mb-3 text-xs text-muted">Nothing in this rack.</p>
      )}

      <p className="kicker mb-1">Find a station</p>
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
        Streams come from the stations, not us. Artist channels:{" "}
        <a
          href="https://exclusive.radio/"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-line underline-offset-2 hover:text-fg"
        >
          Exclusive Radio
        </a>
        . Mixes:{" "}
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
        className={`flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-sm px-2 text-left ${
          active ? "bg-accent-dim" : "bg-panel-2 hover:text-fg"
        }`}
      >
        <span className="live-dot" data-state={active && playing ? "live" : "off"} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{station.name}</span>
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
