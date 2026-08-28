import { useEffect, useRef } from "react";
import { useIntel } from "@/lib/intel/store";

if (typeof window !== "undefined") {
  void import("cesium");
}

export function GlobeCanvas() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cleanup: (() => void) | undefined;
    let cancelled = false;
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
        useIntel.getState().setBoot(err instanceof Error ? err.message : "Globe failed to start");
      });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return <div ref={ref} className="intel-globe" aria-label="3D globe" />;
}
