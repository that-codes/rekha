import { open, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import type { LogLine } from "@rekha/shared";
import { inferLevel, matchesLevel, matchesQuery } from "./level.js";

export interface ReadOptions {
  /** Byte offset to read *before* (for "load older" pagination). Default = EOF. */
  beforeOffset?: number;
  limit: number;
  q?: string;
  level: string;
}

export interface ReadResult {
  lines: LogLine[];
  /** Byte offset to pass as beforeOffset for the next (older) page, or null at BOF. */
  nextCursor: number | null;
}

const CHUNK = 64 * 1024;

/**
 * Reads up to `limit` matching lines ending before `beforeOffset`, scanning the
 * file backwards in chunks. Returns lines oldest→newest. The PM2 log files are
 * the log-of-record; Rekha never copies them, it reads on demand.
 */
export async function readBackwards(
  path: string,
  processName: string,
  stream: "out" | "err",
  opts: ReadOptions,
): Promise<ReadResult> {
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return { lines: [], nextCursor: null };
  }

  let end = Math.min(opts.beforeOffset ?? size, size);
  const fh = await open(path, "r");
  try {
    const collected: LogLine[] = [];
    let leftover = "";
    let pos = end;

    while (pos > 0 && collected.length < opts.limit) {
      const readSize = Math.min(CHUNK, pos);
      pos -= readSize;
      const buf = Buffer.alloc(readSize);
      await fh.read(buf, 0, readSize, pos);
      const text = buf.toString("utf8") + leftover;
      const parts = text.split("\n");
      leftover = parts.shift() ?? "";

      for (let i = parts.length - 1; i >= 0 && collected.length < opts.limit; i--) {
        const raw = parts[i];
        if (raw === undefined || raw === "") continue;
        const level = inferLevel(raw, stream);
        if (!matchesLevel(level, opts.level) || !matchesQuery(raw, opts.q)) continue;
        collected.push({
          ts: Date.now(),
          stream,
          level,
          message: raw,
          processName,
        });
      }
    }

    const nextCursor = pos <= 0 ? null : pos;
    return { lines: collected.reverse(), nextCursor };
  } finally {
    await fh.close();
  }
}

/** Streams an entire log file (for download), honoring an optional byte range. */
export function streamFile(path: string) {
  return createReadStream(path, { encoding: "utf8" });
}

export async function fileSize(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}
