/** Singleton Icecast player. play() must run in the user-gesture stack. */

type Handlers = {
  onPlaying?: () => void;
  onWaiting?: () => void;
  onFailed?: (msg: string) => void;
};

let audio: HTMLAudioElement | null = null;
let lastUrl = "";
let urls: string[] = [];
let index = 0;
let suppressUntil = 0;
let handlers: Handlers = {};
let bound = false;

function el(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (audio) return audio;
  audio = new Audio();
  audio.preload = "auto";
  audio.setAttribute("playsinline", "true");
  audio.hidden = true;
  document.body.appendChild(audio);
  if (!bound) {
    bound = true;
    audio.addEventListener("playing", () => handlers.onPlaying?.());
    audio.addEventListener("waiting", () => handlers.onWaiting?.());
    audio.addEventListener("stalled", () => {
      if (!audio || Date.now() < suppressUntil) return;
      if (audio.readyState >= 2) return;
      void retry();
    });
    audio.addEventListener("error", () => {
      if (Date.now() < suppressUntil) return;
      void retry();
    });
  }
  return audio;
}

async function retry() {
  if (index + 1 < urls.length) {
    index += 1;
    await kick(urls[index]);
    return;
  }
  handlers.onFailed?.("Stream failed.");
}

async function kick(url: string) {
  const a = el();
  if (!a) return;
  suppressUntil = Date.now() + 2500;
  if (lastUrl !== url) {
    lastUrl = url;
    a.src = url;
    a.load();
  }
  try {
    await a.play();
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "AbortError") return;
    if (name === "NotAllowedError") {
      handlers.onFailed?.("Hit play once more.");
      return;
    }
    await retry();
  }
}

export function bindRadioPlayer(next: Handlers) {
  handlers = next;
}

export function setPlayerVolume(n: number) {
  const a = el();
  if (a) a.volume = Math.min(1, Math.max(0, n));
}

export async function startRadio(playUrls: string[], volume: number) {
  urls = playUrls.filter(Boolean);
  index = 0;
  lastUrl = "";
  const a = el();
  if (a) a.volume = volume;
  if (!urls.length) {
    handlers.onFailed?.("No stream URL.");
    return;
  }
  await kick(urls[0]);
}

export function stopRadio() {
  const a = el();
  if (!a) return;
  a.pause();
}
