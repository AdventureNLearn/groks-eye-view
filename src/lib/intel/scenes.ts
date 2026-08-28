import { LAYER_META, type SceneId } from "./types";
import { flash, useIntel } from "./store";

function wait(ms: number) {
  return new Promise<void>((r) => window.setTimeout(r, ms));
}

export async function playScene(id: SceneId) {
  const s = useIntel.getState();
  const engine = s.engine;
  if (!engine) return;
  s.dismissFirstRun(false);

  if (id === "orbital") {
    s.setLayer("satellites", { on: true, freshness: LAYER_META.satellites.freshness });
    engine.setStyle("noir");
    engine.resetGlobe();
    flash("Orbital Watch · CelesTrak");
    await wait(1600);
    engine.trackNearest("iss");
    return;
  }

  if (id === "night") {
    s.setLayer("flights", { on: true, freshness: LAYER_META.flights.freshness });
    engine.setStyle("nvg");
    engine.setMapSource("night");
    await engine.lookupPlace("New York");
    flash("Night Watch · live contacts");
    await wait(1400);
    engine.trackNearest("flight");
    return;
  }

  s.setLayer("fires", { on: true, freshness: LAYER_META.fires.freshness });
  s.setLayer("earthquakes", { on: true, freshness: LAYER_META.earthquakes.freshness });
  engine.setStyle("flir");
  engine.flyTo(-119.4, 36.7, 1_100_000);
  s.setPlace("California");
  flash("Fire Line · USGS + NASA EONET");
}
