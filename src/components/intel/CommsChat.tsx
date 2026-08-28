import { useEffect, useRef } from "react";
import { MessageSquare, Send, X } from "lucide-react";
import { suggestionChips, useComms } from "@/lib/intel/comms";
import { useRadio } from "@/lib/intel/radio";
import { useIntel } from "@/lib/intel/store";

export function CommsChat() {
  const open = useComms((s) => s.open);
  const pending = useComms((s) => s.pending);
  const messages = useComms((s) => s.messages);
  const draft = useComms((s) => s.draft);
  const tracked = useIntel((s) => s.tracked);
  const place = useIntel((s) => s.placeName);
  const radioOn = useRadio((s) => s.playing);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chips = suggestionChips();

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pending, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, tracked?.id, place]);

  if (!open) return null;

  return (
    <aside
      className="panel comms-panel absolute inset-x-3 top-32 bottom-24 z-20 flex flex-col p-3 sm:top-16 md:inset-x-auto md:top-20 md:right-4 md:bottom-24 md:w-[22rem]"
      role="dialog"
      aria-label="Grok comms"
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="kicker flex items-center gap-2">
            <MessageSquare className="size-3" strokeWidth={1.75} />
            Grok comms
          </p>
          <p className="truncate text-xs text-muted">
            {tracked ? `${tracked.kind} · ${tracked.name}` : place}
            {radioOn ? " · radio on" : ""}
          </p>
        </div>
        <button
          type="button"
          className="grid size-10 place-items-center text-muted"
          aria-label="Close comms"
          onClick={() => useComms.getState().setOpen(false)}
        >
          <X className="size-4" />
        </button>
      </header>

      <div ref={logRef} className="comms-log min-h-0 flex-1 space-y-2 pr-1">
        {messages.map((m) => (
          <div key={m.id} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={`max-w-[92%] rounded-sm px-2.5 py-2 text-sm leading-snug ${
                m.role === "user" ? "bg-accent-dim text-fg" : "bg-panel-2 text-fg"
              }`}
            >
              <p className="kicker mb-1">{m.role === "user" ? "You" : "Grok"}</p>
              <p className="whitespace-pre-wrap text-pretty">{m.text}</p>
            </div>
          </div>
        ))}
        {pending && (
          <div className="flex justify-start">
            <div className="rounded-sm bg-panel-2 px-2.5 py-2 text-sm text-muted">
              <p className="kicker mb-1">Grok</p>
              <p>Looking…</p>
            </div>
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            disabled={pending}
            onClick={() => void useComms.getState().send(c)}
            className="rounded-sm bg-panel-2 px-2 py-1.5 text-left text-xs text-muted hover:text-fg disabled:opacity-50"
          >
            {c}
          </button>
        ))}
      </div>

      <form
        className="mt-2 flex min-h-11 items-center gap-2 rounded-sm bg-panel-2 px-2"
        onSubmit={(e) => {
          e.preventDefault();
          void useComms.getState().send();
        }}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => useComms.getState().setDraft(e.target.value)}
          placeholder="Ask Grok about this view"
          className="h-11 min-w-0 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
          aria-label="Message Grok"
          maxLength={500}
          disabled={pending}
        />
        <button
          type="submit"
          className="grid size-10 place-items-center text-accent disabled:opacity-40"
          aria-label="Send"
          disabled={pending || !draft.trim()}
        >
          <Send className="size-4" />
        </button>
      </form>
    </aside>
  );
}
