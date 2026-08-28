const KEY = "grok-eye:feed-keys";

export type StoredFeedKeys = {
  openskyId: string;
  openskySecret: string;
  ais: string;
  firms: string;
};

export const EMPTY_FEED_KEYS: StoredFeedKeys = {
  openskyId: "",
  openskySecret: "",
  ais: "",
  firms: "",
};

export function loadFeedKeys(): StoredFeedKeys {
  if (typeof window === "undefined") return { ...EMPTY_FEED_KEYS };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { ...EMPTY_FEED_KEYS };
    const parsed = JSON.parse(raw) as Partial<StoredFeedKeys>;
    return {
      openskyId: String(parsed.openskyId ?? "").trim(),
      openskySecret: String(parsed.openskySecret ?? "").trim(),
      ais: String(parsed.ais ?? "").trim(),
      firms: String(parsed.firms ?? "").trim(),
    };
  } catch {
    return { ...EMPTY_FEED_KEYS };
  }
}

export function saveFeedKeys(next: StoredFeedKeys) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(next));
}

export function feedAuth() {
  const k = loadFeedKeys();
  return {
    openskyId: k.openskyId || undefined,
    openskySecret: k.openskySecret || undefined,
    aisKey: k.ais || undefined,
    firmsKey: k.firms || undefined,
  };
}

export const FEED_UNLOCK = [
  {
    id: "opensky" as const,
    title: "OpenSky",
    blurb: "Global live flights. Sign up free, then create an API client.",
    href: "https://opensky-network.org/login?view=registration",
    hrefLabel: "Get OpenSky account",
    extraHref: "https://opensky-network.org/my-opensky/account",
    extraLabel: "API client page",
  },
  {
    id: "ais" as const,
    title: "AISStream",
    blurb: "Live boats. GitHub login, copy the API key.",
    href: "https://aisstream.io/account",
    hrefLabel: "Get AISStream key",
  },
  {
    id: "firms" as const,
    title: "NASA FIRMS",
    blurb: "Thermal fire hotspots. Email yourself a MAP_KEY.",
    href: "https://firms.modaps.eosdis.nasa.gov/api/map_key/",
    hrefLabel: "Get FIRMS MAP_KEY",
  },
] as const;
