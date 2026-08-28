import { useEffect, useRef } from "react";
import { isPhone } from "@/lib/intel/phone";
import { useIntel } from "@/lib/intel/store";

if (typeof window !== "undefined" && !isPhone()) {
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
    const phone = isPhone();
    useIntel.getState().setBoot(phone ? "Laying satellite tiles" : "Loading globe engine", 8);
    const boot = phone
      ? import("@/lib/intel/flatEngine").then(({ bootFlatMap }) => bootFlatMap(el))
      : import("@/lib/intel/globeEngine").then(({ bootGlobe }) => bootGlobe(el));
    void boot
      .then((stop) => {
        if (!stop) return;
        if (cancelled) stop();
        else cleanup = stop;
      })
      .catch((err: unknown) => {
        console.error("Globe boot failed", err);
        if (phone) {
          const msg = err instanceof Error ? err.message : "Map failed to start";
          useIntel.getState().setBoot(msg, 100);
          return;
        }
        void import("@/lib/intel/flatEngine")
          .then(({ bootFlatMap }) => {
            if (cancelled) return undefined;
            useIntel.getState().setBoot("3D missed. Switching to tiles.", 40);
            return bootFlatMap(el);
          })
          .then((stop) => {
            if (!stop) return;
            if (cancelled) stop();
            else cleanup = stop;
          })
          .catch((flatErr: unknown) => {
            const msg = flatErr instanceof Error ? flatErr.message : "Map failed to start";
            useIntel.getState().setBoot(msg, 100);
          });
      });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, []);

  return <div ref={ref} className="intel-globe" aria-label="3D globe" />;
}