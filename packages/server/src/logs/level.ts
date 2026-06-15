import type { LogLine } from "@rekha/shared";

/** Best-effort log-level inference from a raw line + originating stream. */
export function inferLevel(message: string, stream: "out" | "err"): LogLine["level"] {
  const m = message.toLowerCase();
  if (/\b(error|err|fatal|exception|fail)\b/.test(m) || /\be[rR][rR]or/.test(message)) {
    return "error";
  }
  if (/\b(warn|warning|deprecat)/.test(m)) return "warn";
  if (/\b(debug|trace|verbose)\b/.test(m)) return "debug";
  return stream === "err" ? "warn" : "info";
}

export function matchesLevel(level: LogLine["level"], filter: string): boolean {
  return filter === "all" || level === filter;
}

export function matchesQuery(message: string, q: string | undefined): boolean {
  if (!q) return true;
  try {
    return new RegExp(q, "i").test(message);
  } catch {
    // Not a valid regex — fall back to substring match.
    return message.toLowerCase().includes(q.toLowerCase());
  }
}
