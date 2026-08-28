import { useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  FEED_UNLOCK,
  loadFeedKeys,
  saveFeedKeys,
  type StoredFeedKeys,
} from "@/lib/intel/feedKeys";
import { flash } from "@/lib/intel/store";

export function FeedUnlock() {
  const [keys, setKeys] = useState<StoredFeedKeys>(() => loadFeedKeys());

  function save(e: React.FormEvent) {
    e.preventDefault();
    const next = {
      openskyId: keys.openskyId.trim(),
      openskySecret: keys.openskySecret.trim(),
      ais: keys.ais.trim(),
      firms: keys.firms.trim(),
    };
    saveFeedKeys(next);
    setKeys(next);
    flash("Keys stay on this phone. Reload a layer to use them.");
  }

  return (
    <form className="mt-3 grid gap-3" onSubmit={save}>
      <p className="kicker">Unlock denser feeds</p>
      {FEED_UNLOCK.map((row) => (
        <div key={row.id} className="grid gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm leading-tight">{row.title}</p>
              <p className="text-xs leading-snug text-subtle">{row.blurb}</p>
            </div>
            <a
              href={row.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs text-accent"
            >
              Get key
              <ExternalLink className="size-3" strokeWidth={1.75} />
            </a>
          </div>
          {row.id === "opensky" ? (
            <>
              {"extraHref" in row && row.extraHref ? (
                <a
                  href={row.extraHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center gap-1 text-xs text-accent"
                >
                  {row.extraLabel}
                  <ExternalLink className="size-3" strokeWidth={1.75} />
                </a>
              ) : null}
              <input
                value={keys.openskyId}
                onChange={(e) => setKeys({ ...keys, openskyId: e.target.value })}
                placeholder="Client ID"
                autoComplete="off"
                className="min-h-11 w-full rounded-sm border border-line bg-panel-2 px-2 text-sm text-fg outline-none placeholder:text-subtle"
                aria-label="OpenSky client ID"
              />
              <input
                type="password"
                value={keys.openskySecret}
                onChange={(e) => setKeys({ ...keys, openskySecret: e.target.value })}
                placeholder="Client secret"
                autoComplete="off"
                className="min-h-11 w-full rounded-sm border border-line bg-panel-2 px-2 text-sm text-fg outline-none placeholder:text-subtle"
                aria-label="OpenSky client secret"
              />
            </>
          ) : (
            <input
              type="password"
              value={row.id === "ais" ? keys.ais : keys.firms}
              onChange={(e) =>
                setKeys(
                  row.id === "ais" ? { ...keys, ais: e.target.value } : { ...keys, firms: e.target.value },
                )
              }
              placeholder={row.id === "ais" ? "AISStream API key" : "FIRMS MAP_KEY"}
              autoComplete="off"
              className="min-h-11 w-full rounded-sm border border-line bg-panel-2 px-2 text-sm text-fg outline-none placeholder:text-subtle"
              aria-label={row.title}
            />
          )}
        </div>
      ))}
      <button
        type="submit"
        className="min-h-11 rounded-sm bg-accent px-3 text-sm text-accent-fg"
      >
        Save keys on this device
      </button>
    </form>
  );
}
