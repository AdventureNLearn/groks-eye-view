import { useIntel } from "@/lib/intel/store";

const KIND_CLASS: Record<string, string> = {
  flight: "det-flight",
  military: "det-mil",
  vessel: "det-ship",
  satellite: "det-sat",
  earthquake: "det-quake",
  fire: "det-fire",
  launch: "det-sat",
};

export function DetectionOverlay() {
  const on = useIntel((s) => s.detection);
  const boxes = useIntel((s) => s.detections);
  const cockpit = useIntel((s) => s.cockpit);
  if (!on || cockpit) return null;
  return (
    <div className="det-layer" aria-hidden>
      {boxes.map((b, i) => (
        <div
          key={`${b.label}-${i}`}
          className={`det-box ${KIND_CLASS[b.kind] ?? ""}`}
          style={{ left: b.x, top: b.y }}
        >
          <span className="det-label">{b.label}</span>
        </div>
      ))}
    </div>
  );
}
