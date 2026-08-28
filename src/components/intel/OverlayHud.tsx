import { useEffect, useRef, useState } from "react";
import {
  Crosshair,
  Globe,
  Layers,
  MessageSquare,
  Pause,
  Plane,
  Play,
  Radio,
  Search,
  Send,
  Share2,
  X,
} from "lucide-react";
import { CommsChat } from "./CommsChat";
import { FirstRun } from "./FirstRun";
import { RadioDeck } from "./RadioDeck";
import { formatAltFt, formatKts, formatLatLon, zuluNow } from "@/lib/intel/geo";
import { runCommand } from "@/lib/intel/runCommand";
import { playScene } from "@/lib/intel/scenes";
import { copyShareUrl } from "@/lib/intel/share";
import { flash, hydrateFirstRun, useIntel } from "@/lib/intel/store";
import { useComms } from "@/lib/intel/comms";
import { findStation, PRESET_STATIONS, useRadio } from "@/lib/intel/radio";
import { getWeather } from "@/lib/feeds/world";
import {
  LAYER_META,
  SCENE_META,
  STYLE_META,
  type LayerId,
  type MapSourceId,
} from "@/lib/intel/types";

const LAYER_ORDER: LayerId[] = [
  "flights",
  "military",
  "vessels",
  "satellites",
  "earthquakes",
  "fires",
  "launches",
];

const MAPS: { id: MapSourceId; label: string }[] = [
  { id: "satellite", label: "Satellite" },
  { id: "streets", label: "Streets" },
  { id: "night", label: "Night" },
];

export function OverlayHud() {
  const ready = useIntel((s) => s.ready);
  const boot = useIntel((s) => s.bootStatus);
  const style = useIntel((s) => s.style);
  const hud = useIntel((s) => s.hud);
  const detection = useIntel((s) => s.detection);
  const density = useIntel((s) => s.detectionDensity);
  const cockpit = useIntel((s) => s.cockpit);
  const clean = useIntel((s) => s.cleanUi);
  const firstRun = useIntel((s) => s.firstRun);
  const command = useIntel((s) => s.command);
  const hint = useIntel((s) => s.commandHint);
  const toast = useIntel((s) => s.toast);
  const place = useIntel((s) => s.placeName);
  const cam = useIntel((s) => s.cam);
  const tracked = useIntel((s) => s.tracked);
  const layers = useIntel((s) => s.layers);
  const mapSource = useIntel((s) => s.mapSource);
  const engine = useIntel((s) => s.engine);
  const weather = useIntel((s) => s.weather);
  const chatOpen = useComms((s) => s.open);
  const radioOpen = useRadio((s) => s.picker);
  const radioPlaying = useRadio((s) => s.playing);
  const radioId = useRadio((s) => s.stationId);
  const radioCustom = useRadio((s) => s.custom);
  const radioNow = useRadio((s) => s.nowPlaying);
  const radioStation = findStation(radioId, radioCustom) ?? PRESET_STATIONS[0];
  const inputRef = useRef<HTMLInputElement>(null);
  const [zulu, setZulu] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    hydrateFirstRun();
    const tick = () => setZulu(zuluNow());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";
      if (e.key === "Escape") {
        if (useComms.getState().open) {
          useComms.getState().setOpen(false);
          return;
        }
        if (useRadio.getState().picker) {
          useRadio.getState().setPicker(false);
          return;
        }
        if (useIntel.getState().firstRun) useIntel.getState().dismissFirstRun(false);
        else if (useIntel.getState().cockpit) engine?.enterCockpit(false);
        else if (useIntel.getState().tracked) engine?.track(null);
        else setDrawerOpen(false);
        return;
      }
      if (typing) return;
      if (e.key === "/") {
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if ((e.key === "g" || e.key === "G") && !useIntel.getState().firstRun) {
        const next = !useComms.getState().open;
        useComms.getState().setOpen(next);
        if (next) {
          useRadio.getState().setPicker(false);
          setDrawerOpen(false);
        }
        return;
      }
      if ((e.key === "r" || e.key === "R") && !useIntel.getState().firstRun) {
        const next = !useRadio.getState().picker;
        useRadio.getState().setPicker(next);
        if (next) {
          useComms.getState().setOpen(false);
          setDrawerOpen(false);
        }
        return;
      }
      if (useRadio.getState().picker) {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          useRadio.getState().next();
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          useRadio.getState().prev();
          return;
        }
      }
      if (e.key === "l" || e.key === "L") {
        setDrawerOpen((v) => !v);
        useComms.getState().setOpen(false);
        useRadio.getState().setPicker(false);
        return;
      }
      const styleHit = STYLE_META.find((s) => s.key === e.key);
      if (styleHit) engine?.setStyle(styleHit.id);
      if (e.key === "h" || e.key === "H") useIntel.getState().setHud(!useIntel.getState().hud);
      if (e.key === "d" || e.key === "D") {
        useIntel.getState().setDetection(!useIntel.getState().detection);
      }
      if (e.key === "c" || e.key === "C") {
        const on = !useIntel.getState().cockpit;
        void runCommand(on ? "enter cockpit" : "exit cockpit");
      }
      if (e.key === "n" || e.key === "N") engine?.nextContact();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [engine]);

  useEffect(() => {
    if (!tracked) {
      useIntel.getState().setWeather(null);
      return;
    }
    const id = tracked.id;
    let cancelled = false;
    void getWeather({ data: { lat: tracked.lat, lon: tracked.lon } })
      .then((w) => {
        if (!cancelled && useIntel.getState().tracked?.id === id) {
          useIntel.getState().setWeather(w);
        }
      })
      .catch(() => {
        if (!cancelled) useIntel.getState().setWeather(null);
      });
    return () => {
      cancelled = true;
    };
  }, [tracked?.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const text = command.trim();
    if (!text) return;
    useIntel.getState().setCommand("");
    await runCommand(text);
  }

  const liveCount = LAYER_ORDER.reduce((n, id) => n + (layers[id].on ? layers[id].count : 0), 0);

  return (
    <div className={`intel-hud style-${style}`}>
      <div className="hud-corners" aria-hidden />

      {!ready && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-void pointer-events-auto">
          <div className="scanline absolute inset-0 opacity-40" />
          <div className="relative text-center px-6">
            <p className="kicker">Waking the all-seeing meme</p>
            <h1 className="font-display mt-2 text-4xl font-semibold tracking-wide">
              <span className="text-accent">GROK'S</span> EYE VIEW
            </h1>
            <p className="hud-num mt-3 text-xs text-muted">{boot}</p>
          </div>
        </div>
      )}

      {hud && !clean && (
        <>
          <header className="absolute top-3 left-3 right-3 z-30 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between md:top-4 md:left-4 md:right-4">
            <div className="pointer-events-none min-w-0">
              <h1 className="font-display truncate text-xl leading-none font-semibold tracking-wide md:text-2xl">
                <span className="text-accent">GROK'S</span> EYE VIEW
              </h1>
              <p className="hud-num mt-1 truncate text-xs text-muted">
                {zulu} · {place} · {liveCount}
              </p>
            </div>
            <div className="hud-toolbar panel pointer-events-auto flex w-fit shrink-0 items-center self-end sm:self-auto">
              <button
                type="button"
                className={`grid size-11 place-items-center rounded-sm ${
                  radioPlaying ? "bg-accent text-accent-fg" : ""
                }`}
                title={radioPlaying ? "Pause radio" : "Play radio"}
                aria-label={radioPlaying ? "Pause radio" : "Play radio"}
                onClick={() => {
                  if (useIntel.getState().firstRun) useIntel.getState().dismissFirstRun(false);
                  useRadio.getState().toggle();
                }}
              >
                {radioPlaying ? (
                  <Pause className="size-4" strokeWidth={1.75} />
                ) : (
                  <Play className="size-4" strokeWidth={1.75} />
                )}
              </button>
              <button
                type="button"
                data-on={radioOpen ? "true" : "false"}
                className="flex min-h-11 max-w-44 items-center gap-1.5 rounded-sm px-2 md:max-w-56"
                title="Radio stations (R)"
                aria-label="Open radio stations"
                onClick={() => {
                  if (useIntel.getState().firstRun) useIntel.getState().dismissFirstRun(false);
                  const next = !useRadio.getState().picker;
                  useRadio.getState().setPicker(next);
                  if (next) {
                    useComms.getState().setOpen(false);
                    setDrawerOpen(false);
                  }
                }}
              >
                <Radio className="size-4 shrink-0" strokeWidth={1.75} />
                <span className="hidden min-w-0 truncate text-xs sm:inline">
                  {radioPlaying && radioNow ? radioNow : radioStation.name}
                </span>
                {radioPlaying && <span className="live-dot shrink-0" data-state="live" />}
              </button>
              <button
                type="button"
                data-on={chatOpen ? "true" : "false"}
                className="flex min-h-11 items-center gap-1.5 rounded-sm px-2"
                title="Grok comms (G)"
                aria-label="Toggle Grok comms"
                onClick={() => {
                  if (useIntel.getState().firstRun) useIntel.getState().dismissFirstRun(false);
                  const next = !useComms.getState().open;
                  useComms.getState().setOpen(next);
                  if (next) {
                    useRadio.getState().setPicker(false);
                    setDrawerOpen(false);
                  }
                }}
              >
                <MessageSquare className="size-4" strokeWidth={1.75} />
                <span className="hidden text-xs md:inline">Comms</span>
              </button>
              <button
                type="button"
                data-on={drawerOpen ? "true" : "false"}
                className="flex min-h-11 items-center gap-1.5 rounded-sm px-2"
                title="Layers (L)"
                aria-label="Toggle layers"
                onClick={() => {
                  setDrawerOpen((v) => !v);
                  useComms.getState().setOpen(false);
                  useRadio.getState().setPicker(false);
                }}
              >
                <Layers className="size-4" strokeWidth={1.75} />
                <span className="hidden text-xs md:inline">Layers</span>
              </button>
              <button
                type="button"
                className="hidden size-11 place-items-center rounded-sm sm:grid"
                title="Copy share link"
                aria-label="Share view"
                onClick={async () => {
                  const ok = await copyShareUrl();
                  flash(ok ? "Copied. Send it to the group chat." : "Share link ready");
                }}
              >
                <Share2 className="size-4" strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className="hidden size-11 place-items-center rounded-sm sm:grid"
                title="Reset globe"
                aria-label="Reset globe"
                onClick={() => engine?.resetGlobe()}
              >
                <Globe className="size-4" strokeWidth={1.75} />
              </button>
            </div>
          </header>

          {drawerOpen && !chatOpen && !radioOpen && (
          <section className="panel layer-rail absolute top-32 left-3 z-20 overflow-y-auto p-3 sm:top-16 md:top-20 md:left-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="kicker flex items-center gap-2">
                <Layers className="size-3" /> Open sources
              </span>
            </div>
            <ul className="grid gap-1">
              {LAYER_ORDER.map((id) => {
                const meta = LAYER_META[id];
                const st = layers[id];
                return (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() =>
                        useIntel.getState().setLayer(id, {
                          on: !st.on,
                          freshness: !st.on ? meta.freshness : "off",
                        })
                      }
                      className={`flex w-full min-h-11 items-center gap-2 rounded-sm px-2 py-1.5 text-left ${
                        st.on ? "bg-accent-dim" : "hover:bg-panel-2"
                      }`}
                    >
                      <span className="live-dot" data-state={st.on ? st.freshness : "off"} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm leading-tight">{meta.label}</span>
                        <span className="block truncate text-xs text-subtle">
                          {st.on ? `${st.count} · ${st.detail}` : meta.source}
                        </span>
                      </span>
                      <span className="hud-num text-xs text-muted">{meta.short}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="kicker mt-3">Display</p>
            <div className="mt-1 grid grid-cols-2 gap-1">
              <Toggle
                label="Detect"
                hotkey="D"
                on={detection}
                onClick={() => useIntel.getState().setDetection(!detection)}
              />
              <Toggle
                label="Cockpit"
                hotkey="C"
                on={cockpit}
                onClick={() => void runCommand(cockpit ? "exit cockpit" : "enter cockpit")}
              />
              <Toggle
                label="Clean"
                hotkey=""
                on={clean}
                onClick={() => useIntel.getState().setCleanUi(!clean)}
              />
            </div>
            {detection && (
              <label className="mt-3 block">
                <span className="kicker">Density {density}%</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={density}
                  onChange={(e) => useIntel.getState().setDensity(Number(e.target.value))}
                  className="mt-1 w-full accent-accent"
                />
              </label>
            )}
            <p className="kicker mt-3">Map</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {MAPS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => engine?.setMapSource(m.id)}
                  className={`min-h-9 rounded-sm px-2 text-xs ${
                    mapSource === m.id ? "bg-accent text-accent-fg" : "bg-panel-2 text-muted"
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="kicker mt-3">Go look</p>
            <div className="mt-1 grid gap-1">
              {SCENE_META.map((sc) => (
                <button
                  key={sc.id}
                  type="button"
                  onClick={() => void playScene(sc.id)}
                  className="min-h-10 rounded-sm bg-panel-2 px-2 text-left text-xs text-muted hover:text-fg"
                >
                  {sc.label}
                </button>
              ))}
            </div>
            <div className="mt-3 flex gap-1 sm:hidden">
              <button
                type="button"
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-sm bg-panel-2 text-xs"
                onClick={async () => {
                  const ok = await copyShareUrl();
                  flash(ok ? "Copied. Send it to the group chat." : "Share link ready");
                }}
              >
                <Share2 className="size-4" strokeWidth={1.75} />
                Share
              </button>
              <button
                type="button"
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-sm bg-panel-2 text-xs"
                onClick={() => engine?.resetGlobe()}
              >
                <Globe className="size-4" strokeWidth={1.75} />
                Reset
              </button>
            </div>
          </section>
          )}

          {tracked && !chatOpen && !radioOpen && (
            <article className="panel absolute bottom-28 left-3 z-10 p-3 md:left-4 md:w-72">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="kicker">{tracked.kind}</p>
                  <h2 className="font-display truncate text-xl font-semibold tracking-wide">
                    {tracked.name}
                  </h2>
                </div>
                <button
                  type="button"
                  className="grid size-9 place-items-center text-muted"
                  onClick={() => engine?.track(null)}
                  aria-label="Clear track"
                >
                  <X className="size-4" />
                </button>
              </div>
              <p className="mt-1 text-xs text-muted">{tracked.meta}</p>
              <dl className="hud-num mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-subtle">Position</dt>
                <dd>{formatLatLon(tracked.lat, tracked.lon)}</dd>
                <dt className="text-subtle">Altitude</dt>
                <dd>{formatAltFt(tracked.altM)}</dd>
                <dt className="text-subtle">Heading</dt>
                <dd>{Math.round(tracked.heading)}°</dd>
                <dt className="text-subtle">Speed</dt>
                <dd>{formatKts(tracked.speedMs)} kts</dd>
                <dt className="text-subtle">Source</dt>
                <dd className="truncate">{tracked.source}</dd>
                <dt className="text-subtle">State</dt>
                <dd className="uppercase">{tracked.freshness}</dd>
                {weather && (
                  <>
                    <dt className="text-subtle">WX</dt>
                    <dd>
                      {weather.sky} · {weather.temp} · {weather.wind}
                    </dd>
                  </>
                )}
              </dl>
              <div className="mt-3 flex gap-2">
                {(tracked.kind === "flight" || tracked.kind === "military") && (
                  <button
                    type="button"
                    className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-sm bg-accent text-sm font-medium text-accent-fg"
                    onClick={() => engine?.enterCockpit(true)}
                  >
                    <Plane className="size-4" strokeWidth={1.75} />
                    Cockpit
                  </button>
                )}
                {(tracked.kind === "flight" || tracked.kind === "military") && (
                  <button
                    type="button"
                    className="flex min-h-11 items-center justify-center rounded-sm bg-panel-2 px-3 text-xs text-muted"
                    onClick={() => engine?.nextContact()}
                  >
                    Next
                  </button>
                )}
              </div>
            </article>
          )}
        </>
      )}

      {cockpit && tracked && (
        <div className="pointer-events-none absolute inset-0">
          <div className="cockpit-reticle" />
          <div className="absolute top-20 left-1/2 -translate-x-1/2 text-center">
            <p className="kicker">You are the plane now</p>
            <p className="font-display text-2xl font-semibold tracking-wide">{tracked.name}</p>
          </div>
          <div className="absolute bottom-28 left-1/2 flex -translate-x-1/2 items-end gap-8">
            <Readout label="Ground speed" value={formatKts(tracked.speedMs)} unit="kts" />
            <div className="text-center">
              <p className="hud-num text-3xl font-medium">
                {String(Math.round(tracked.heading)).padStart(3, "0")}
                <span className="text-base text-muted">°</span>
              </p>
              <p className="kicker">Heading</p>
            </div>
            <Readout
              label="Altitude"
              value={Math.round(tracked.altM * 3.28084).toLocaleString()}
              unit="ft"
            />
          </div>
          <p className="absolute bottom-20 left-1/2 -translate-x-1/2 text-xs text-muted">
            Esc exit · C toggle · N next contact
          </p>
        </div>
      )}

      {!clean && !chatOpen && (
        <footer className="absolute right-3 bottom-3 left-3 z-10 md:right-4 md:bottom-4 md:left-4">
          <div className="mx-auto max-w-3xl">
            <div className="panel flex flex-col gap-2 p-2 md:flex-row md:items-center">
              <div className="flex gap-1 overflow-x-auto">
                {STYLE_META.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    title={`${s.label} (${s.key})`}
                    onClick={() => engine?.setStyle(s.id)}
                    className={`min-h-10 min-w-10 rounded-sm px-2 text-xs ${
                      style === s.id ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"
                    }`}
                  >
                    {s.label}
                    <span className="ml-1 text-xs opacity-60">{s.key}</span>
                  </button>
                ))}
              </div>
              <form onSubmit={submit} className="flex min-h-11 flex-1 items-center gap-2 px-1">
                <Search className="size-4 shrink-0 text-muted" />
                <input
                  ref={inputRef}
                  value={command}
                  onChange={(e) => useIntel.getState().setCommand(e.target.value)}
                  placeholder={hint}
                  className="h-11 w-full bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
                  aria-label="Command the globe"
                />
                <button
                  type="submit"
                  className="grid size-10 place-items-center text-accent"
                  aria-label="Send"
                >
                  <Send className="size-4" />
                </button>
              </form>
            </div>
            <p className="hud-num mt-1 px-1 text-xs text-subtle">
              {formatLatLon(cam.lat, cam.lon)} · {formatAltFt(cam.height)} · inspired by{" "}
              <a
                href="https://github.com/bilawalsidhu/gods-eye-view"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-line underline-offset-2 hover:text-fg"
              >
                Bilawal Sidhu
              </a>
            </p>
          </div>
        </footer>
      )}

      {clean && (
        <button
          type="button"
          className="panel absolute top-4 right-4 z-10 min-h-11 px-3 text-xs"
          onClick={() => useIntel.getState().setCleanUi(false)}
        >
          Exit clean view
        </button>
      )}

      {toast && (
        <div className="panel absolute top-16 left-1/2 z-30 -translate-x-1/2 px-3 py-2 text-sm">
          {toast}
        </div>
      )}

      <CommsChat />
      <RadioDeck />

      {firstRun && <FirstRun />}

      {detection && !cockpit && (
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-accent/40">
          <Crosshair className="size-8" strokeWidth={1.25} />
        </div>
      )}
    </div>
  );
}

function Toggle({
  label,
  hotkey,
  on,
  onClick,
}: {
  label: string;
  hotkey: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-10 items-center justify-between rounded-sm px-2 text-xs ${
        on ? "bg-accent-dim text-fg" : "bg-panel-2 text-muted"
      }`}
    >
      <span>{label}</span>
      {hotkey ? <span className="hud-num text-xs opacity-60">{hotkey}</span> : null}
    </button>
  );
}

function Readout({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="text-center">
      <p className="kicker">{label}</p>
      <p className="hud-num text-2xl font-medium">
        {value} <span className="text-xs text-muted">{unit}</span>
      </p>
    </div>
  );
}
