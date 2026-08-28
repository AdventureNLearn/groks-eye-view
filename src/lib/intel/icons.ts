function canvas() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  if (!g) throw new Error("canvas");
  return { c, g };
}

function planePath(g: CanvasRenderingContext2D, color: string) {
  g.fillStyle = color;
  g.strokeStyle = "#07090c";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, -22);
  g.lineTo(6, -2);
  g.lineTo(22, 6);
  g.lineTo(6, 3);
  g.lineTo(4, 16);
  g.lineTo(10, 22);
  g.lineTo(0, 16);
  g.lineTo(-10, 22);
  g.lineTo(-4, 16);
  g.lineTo(-6, 3);
  g.lineTo(-22, 6);
  g.lineTo(-6, -2);
  g.closePath();
  g.fill();
  g.stroke();
}

export function makeIcon(
  kind: "plane" | "mil" | "ship" | "sat" | "quake" | "fire" | "rocket" | "iss",
  color: string,
) {
  const { c, g } = canvas();
  g.translate(32, 32);
  g.fillStyle = color;
  g.strokeStyle = color;
  g.lineWidth = 2.5;
  g.lineJoin = "round";
  g.lineCap = "round";

  if (kind === "plane" || kind === "mil") {
    planePath(g, color);
  } else if (kind === "ship") {
    g.beginPath();
    g.moveTo(0, -20);
    g.lineTo(10, -6);
    g.lineTo(16, 16);
    g.lineTo(-16, 16);
    g.lineTo(-10, -6);
    g.closePath();
    g.fill();
  } else if (kind === "sat" || kind === "iss") {
    g.strokeRect(-6, -6, 12, 12);
    g.beginPath();
    g.moveTo(-6, 0);
    g.lineTo(-22, 0);
    g.moveTo(6, 0);
    g.lineTo(22, 0);
    g.moveTo(-22, -8);
    g.lineTo(-22, 8);
    g.moveTo(22, -8);
    g.lineTo(22, 8);
    g.stroke();
    if (kind === "iss") {
      g.beginPath();
      g.arc(0, 0, 18, 0, Math.PI * 2);
      g.stroke();
    }
  } else if (kind === "quake") {
    g.beginPath();
    g.arc(0, 0, 6, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(0, 0, 14, 0, Math.PI * 2);
    g.stroke();
    g.beginPath();
    g.arc(0, 0, 22, 0, Math.PI * 2);
    g.globalAlpha = 0.5;
    g.stroke();
    g.globalAlpha = 1;
  } else if (kind === "fire") {
    g.beginPath();
    g.moveTo(0, 20);
    g.quadraticCurveTo(18, 8, 8, -8);
    g.quadraticCurveTo(4, 2, 0, -20);
    g.quadraticCurveTo(-4, 2, -8, -8);
    g.quadraticCurveTo(-18, 8, 0, 20);
    g.fill();
  } else if (kind === "rocket") {
    g.beginPath();
    g.moveTo(0, -22);
    g.lineTo(8, 6);
    g.lineTo(0, 2);
    g.lineTo(-8, 6);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(-6, 8);
    g.lineTo(0, 22);
    g.lineTo(6, 8);
    g.stroke();
  }
  return c;
}
