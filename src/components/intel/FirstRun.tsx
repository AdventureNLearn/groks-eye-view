import { useRef } from "react";
import { Flame, Radar, Rocket, Globe } from "lucide-react";
import { flash, useIntel } from "@/lib/intel/store";

const CHOICES = [
  {
    id: "contacts" as const,
    title: "Live contacts",
    copy: "Aircraft and modeled vessels on real corridors",
    icon: Radar,
  },
  {
    id: "space" as const,
    title: "Space missions",
    copy: "ISS, catalog satellites, upcoming launches",
    icon: Rocket,
  },
  {
    id: "environment" as const,
    title: "Environmental",
    copy: "USGS earthquakes and NASA wildfire events",
    icon: Flame,
  },
  {
    id: "explore" as const,
    title: "Explore manually",
    copy: "Begin with a clean globe",
    icon: Globe,
  },
];

export function FirstRun() {
  const persist = useRef(false);
  const dismiss = useIntel((s) => s.dismissFirstRun);
  const setLayer = useIntel((s) => s.setLayer);
  const engine = useIntel((s) => s.engine);
  const ready = useIntel((s) => s.ready);

  function pick(id: (typeof CHOICES)[number]["id"]) {
    let place = "";
    if (id === "contacts") {
      setLayer("flights", { on: true, freshness: "live" });
      setLayer("vessels", { on: true, freshness: "simulated" });
      engine?.flyTo(-74.0, 40.6, 420_000);
      place = "New York corridor";
      flash("Live contacts · OpenSky + modeled AIS");
    } else if (id === "space") {
      setLayer("satellites", { on: true, freshness: "live" });
      setLayer("launches", { on: true, freshness: "live" });
      window.setTimeout(() => engine?.trackNearest("iss"), 1400);
      place = "Orbital";
      flash("Space missions · CelesTrak + Launch Library");
    } else if (id === "environment") {
      setLayer("earthquakes", { on: true, freshness: "live" });
      setLayer("fires", { on: true, freshness: "live" });
      engine?.flyTo(-119.4, 36.7, 1_100_000);
      place = "California";
      flash("Environmental · USGS + NASA EONET");
    } else {
      flash("Explore · enable layers when you want them");
    }
    dismiss(persist.current);
    if (place) useIntel.getState().setPlace(place);
  }

  return (
    <aside
      className="panel pointer-events-auto absolute top-1/2 left-1/2 z-20 w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 p-5"
      role="dialog"
      aria-labelledby="first-run-title"
    >
      <p className="kicker">Mission control · first launch</p>
      <h2
        id="first-run-title"
        className="font-display mt-2 text-2xl font-semibold tracking-tight text-fg"
      >
        Choose your first view
      </h2>
      <p className="mt-2 text-sm leading-snug text-muted text-pretty">
        It feels like a forbidden cockpit — then you realize the sources are public
        and the data is real.
      </p>
      <div className="mt-4 grid gap-2">
        {CHOICES.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.id}
              type="button"
              disabled={!ready && c.id !== "explore"}
              onClick={() => pick(c.id)}
              className="flex min-h-11 items-center gap-3 rounded-sm border border-line bg-panel-2 px-3 py-2.5 text-left transition-colors duration-150 hover:border-line-strong hover:bg-panel disabled:opacity-50"
            >
              <Icon className="size-4 shrink-0 text-accent" strokeWidth={1.75} />
              <span className="min-w-0 flex-1">
                <strong className="block font-display text-base font-semibold tracking-wide">
                  {c.title}
                </strong>
                <small className="block text-xs text-muted">{c.copy}</small>
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-subtle">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="size-3.5 accent-accent"
            onChange={(e) => {
              persist.current = e.target.checked;
            }}
          />
          Don't show this again
        </label>
        <button type="button" className="text-muted hover:text-fg" onClick={() => dismiss(false)}>
          Esc
        </button>
      </div>
    </aside>
  );
}
