import { useEffect, useRef } from "react";
import { useIntel } from "@/lib/intel/store";

if (typeof window !== "undefined") {
  (window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = "/cesiumStatic/";
  void import("cesium");
}

export function GlobeCanvas() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
    useIntel.getState().setBoot("Loading globe engine", 8);
    void import("@/lib/intel/globeEngine")
      .then(({ bootGlobe }) => {
        if (cancelled) return undefined;
        return bootGlobe(el);
      })
      .then((stop) => {
        if (!stop) return;
        if (cancelled) stop();
        else cleanup = stop;
      })
      .catch((err: unknown) => {
        console.error("Globe boot failed", err);
        const msg = err instanceof Error ? err.message : "Globe failed to start";
        useIntel.getState().setBoot(msg, 100);
      });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return <div ref={ref} className="intel-globe" aria-label="3D globe" />;
}
