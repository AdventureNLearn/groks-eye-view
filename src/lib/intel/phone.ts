export function isPhone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (new URLSearchParams(window.location.search).get("flat") === "1") return true;
  } catch {
    /* ignore */
  }
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    /Android|iPhone|iPod|Mobile/i.test(navigator.userAgent)
  );
}
