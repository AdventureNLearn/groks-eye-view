import { DetectionOverlay } from "./DetectionOverlay";
import { GlobeCanvas } from "./GlobeCanvas";
import { OverlayHud } from "./OverlayHud";
import { useIntel } from "@/lib/intel/store";

export function IntelApp() {
  const style = useIntel((s) => s.style);
  return (
    <main className="intel-shell" data-style={style}>
      <GlobeCanvas />
      <DetectionOverlay />
      <OverlayHud />
    </main>
  );
}
