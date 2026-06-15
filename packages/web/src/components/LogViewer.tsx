import { useEffect, useRef, useState, useCallback } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { LogLine } from "@rekha/shared";
import { api } from "../api/client.js";
import { wsClient } from "../api/ws.js";
import { Button } from "./ui.js";
import { Icon } from "./icons.js";
import { time } from "../lib/format.js";

const MAX_LINES = 50_000; // bounded ring buffer; older lines fetched from disk on scroll-up.

interface Entry {
  id: number;
  line: LogLine;
}

const levelStyles: Record<string, { text: string; tag: string; row: string }> = {
  error: { text: "text-red-300", tag: "bg-red-500/20 text-red-300", row: "bg-red-500/[0.06]" },
  warn: { text: "text-amber-200", tag: "bg-amber-500/20 text-amber-300", row: "bg-amber-500/[0.04]" },
  debug: { text: "text-slate-500", tag: "bg-slate-600/30 text-slate-400", row: "" },
  info: { text: "text-slate-300", tag: "bg-slate-600/30 text-slate-400", row: "" },
};

const tagLabel: Record<string, string> = { error: "ERR", warn: "WRN", debug: "DBG", info: "INF" };

interface Props {
  processName: string;
}

export function LogViewer({ processName }: Props) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [paused, setPaused] = useState(false);
  const [stream, setStream] = useState<"all" | "out" | "err">("all");
  const [level, setLevel] = useState("all");
  const [q, setQ] = useState("");
  const [wrapAll, setWrapAll] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [cursor, setCursor] = useState<number | null>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const idRef = useRef(0);

  const parentRef = useRef<HTMLDivElement>(null);
  const topic = `process:${processName}:logs`;

  const wrap = useCallback((lines: LogLine[]): Entry[] => lines.map((line) => ({ id: idRef.current++, line })), []);

  const rowVirtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24,
    overscan: 30,
    // Measure each row's real height so expanded/wrapped lines never overlap.
    measureElement: (el) => el.getBoundingClientRect().height,
  });

  const toggle = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const loadBackfill = useCallback(
    async (before?: number) => {
      const params = new URLSearchParams({ stream, level, limit: "500" });
      if (q) params.set("q", q);
      if (before !== undefined) params.set("cursor", String(before));
      const res = await api.get<{ lines: LogLine[]; nextCursor: number | null }>(
        `/processes/${encodeURIComponent(processName)}/logs?${params}`,
      );
      setCursor(res.nextCursor);
      const fresh = wrap(res.lines);
      setEntries((prev) => (before === undefined ? fresh : [...fresh, ...prev]).slice(-MAX_LINES));
    },
    [processName, stream, level, q, wrap],
  );

  useEffect(() => {
    setEntries([]);
    void loadBackfill();
  }, [loadBackfill]);

  useEffect(() => {
    wsClient.subscribe(topic, { stream, level, q });
    const off = wsClient.onMessage((msg) => {
      if (msg.topic !== topic || msg.event !== "line") return;
      if (pausedRef.current) return;
      setEntries((prev) => [...prev, { id: idRef.current++, line: msg.data as LogLine }].slice(-MAX_LINES));
    });
    return () => {
      off();
      wsClient.unsubscribe(topic);
    };
  }, [topic, stream, level, q]);

  useEffect(() => {
    if (!paused && entries.length) rowVirtualizer.scrollToIndex(entries.length - 1, { align: "end" });
  }, [entries.length, paused, rowVirtualizer]);

  // Esc exits fullscreen.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const selectClass =
    "rounded-md border border-rekha-border bg-rekha-bg px-2 py-1.5 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none";

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col gap-3 bg-rekha-bg p-4"
          : "flex h-full flex-col gap-3"
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Icon name="search" width={15} height={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search / regex…"
            className={`w-full pl-9 ${selectClass}`}
          />
        </div>
        <select value={stream} onChange={(e) => setStream(e.target.value as never)} className={selectClass}>
          <option value="all">All Streams</option>
          <option value="out">stdout</option>
          <option value="err">stderr</option>
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value)} className={selectClass}>
          <option value="all">All Levels</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
          <option value="debug">debug</option>
        </select>
        <Button
          variant={wrapAll ? "primary" : "ghost"}
          onClick={() => setWrapAll((w) => !w)}
          title="Wrap or unwrap all lines"
        >
          {wrapAll ? "↩ Unwrap" : "↔ Wrap"}
        </Button>
        <Button variant={paused ? "primary" : "ghost"} onClick={() => setPaused((p) => !p)}>
          {paused ? "▶ Resume" : "⏸ Pause"}
        </Button>
        <a
          href={`/api/v1/processes/${encodeURIComponent(processName)}/logs/download?stream=${stream === "err" ? "err" : "out"}`}
          className="rounded-md px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
        >
          ↓ Download
        </a>
        <Button
          variant={fullscreen ? "primary" : "ghost"}
          onClick={() => setFullscreen((f) => !f)}
          title={fullscreen ? "Exit fullscreen (Esc)" : "Expand to fullscreen"}
          className="px-2"
        >
          <Icon name={fullscreen ? "minimize" : "expand"} width={16} height={16} />
        </Button>
      </div>

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {entries.length.toLocaleString()} line{entries.length === 1 ? "" : "s"} buffered
          {paused && <span className="ml-2 text-amber-400">• paused</span>}
        </span>
        {cursor !== null && (
          <button onClick={() => void loadBackfill(cursor)} className="text-emerald-400 hover:underline">
            ↑ Load older
          </button>
        )}
      </div>

      <div
        ref={parentRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-lg border border-rekha-border bg-[#0a0d13] font-mono text-[12.5px] leading-[1.5]"
      >
        {entries.length === 0 ? (
          <div className="flex h-full items-center justify-center text-slate-600">No log lines.</div>
        ) : (
          <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative", width: "100%" }}>
            {rowVirtualizer.getVirtualItems().map((vi) => {
              const entry = entries[vi.index]!;
              const { line } = entry;
              const isOpen = wrapAll || expanded.has(entry.id);
              const s = levelStyles[line.level] ?? levelStyles.info!;
              return (
                <div
                  key={vi.key}
                  data-index={vi.index}
                  ref={rowVirtualizer.measureElement}
                  className={`group absolute left-0 right-0 top-0 flex gap-2 border-l-2 pr-3 hover:bg-white/[0.04] ${s.row} ${
                    line.level === "error" ? "border-red-500/60" : line.level === "warn" ? "border-amber-500/50" : "border-transparent"
                  }`}
                  style={{ transform: `translateY(${vi.start}px)` }}
                >
                  <button
                    onClick={() => toggle(entry.id)}
                    aria-label={isOpen ? "Collapse line" : "Expand line"}
                    className="w-5 shrink-0 select-none self-stretch py-0.5 text-center text-slate-600 hover:text-emerald-400"
                  >
                    {isOpen ? "▾" : "▸"}
                  </button>
                  <span className="select-none py-0.5 text-[10px] tabular-nums text-slate-600">{time(line.ts)}</span>
                  <span className={`my-px h-fit shrink-0 select-none rounded px-1 text-[9px] font-bold leading-4 tracking-wide ${s.tag}`}>
                    {tagLabel[line.level]}
                  </span>
                  <span
                    className={`flex-1 py-0.5 ${isOpen ? "whitespace-pre-wrap break-all" : "truncate"} ${s.text}`}
                    onClick={() => toggle(entry.id)}
                    role="button"
                    title={isOpen ? undefined : "Click to expand"}
                  >
                    {line.message}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
