import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AuditEntry } from "@rekha/shared";
import { api } from "../../api/client.js";
import { Card, Spinner } from "../../components/ui.js";
import { Icon } from "../../components/icons.js";
import { dateTime } from "../../lib/format.js";

const resultPill: Record<string, string> = {
  ok: "bg-emerald-500/15 text-emerald-300",
  denied: "bg-amber-500/15 text-amber-300",
  fail: "bg-red-500/15 text-red-300",
};
const resultDot: Record<string, string> = {
  ok: "bg-emerald-400",
  denied: "bg-amber-400",
  fail: "bg-red-400",
};

export function Audit() {
  const [search, setSearch] = useState("");
  const [result, setResult] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["audit"],
    queryFn: () => api.get<{ entries: AuditEntry[] }>("/audit?limit=300"),
    refetchInterval: 15_000,
  });

  const entries = data?.entries ?? [];
  const filtered = useMemo(
    () =>
      entries.filter((e) => {
        if (result !== "all" && e.result !== result) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          e.action.toLowerCase().includes(q) ||
          (e.actorUsername ?? "").toLowerCase().includes(q) ||
          (e.targetId ?? "").toLowerCase().includes(q)
        );
      }),
    [entries, search, result],
  );

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-100">Audit Log</h1>
          <p className="mt-1 text-sm text-slate-500">{entries.length} recent security events</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Icon name="search" width={16} height={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by actor, action, or target…"
            className="w-full rounded-lg border border-rekha-border bg-rekha-panel/60 py-2 pl-9 pr-3 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <select
          value={result}
          onChange={(e) => setResult(e.target.value)}
          className="rounded-lg border border-rekha-border bg-rekha-panel/60 px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
        >
          <option value="all">All results</option>
          <option value="ok">OK</option>
          <option value="denied">Denied</option>
          <option value="fail">Failed</option>
        </select>
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-rekha-border text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-3 pl-4">Time</th>
              <th className="py-3">Actor</th>
              <th className="py-3">Action</th>
              <th className="py-3">Target</th>
              <th className="py-3">IP</th>
              <th className="py-3 pr-4">Result</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id} className="border-b border-rekha-border/40 last:border-0 hover:bg-slate-800/30">
                <td className="py-3 pl-4 text-slate-400">{dateTime(e.ts)}</td>
                <td className="py-3">
                  {e.actorUsername ? (
                    <div className="flex items-center gap-2">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-700 text-[11px] font-semibold uppercase text-slate-200">
                        {e.actorUsername.slice(0, 1)}
                      </div>
                      <span className="text-slate-200">{e.actorUsername}</span>
                    </div>
                  ) : (
                    <span className="text-slate-500">system</span>
                  )}
                </td>
                <td className="py-3">
                  <code className="rounded bg-slate-800/70 px-1.5 py-0.5 text-xs text-slate-300">{e.action}</code>
                </td>
                <td className="py-3 text-slate-400">{e.targetType ? `${e.targetType}:${e.targetId}` : "—"}</td>
                <td className="py-3 text-slate-500">{e.ip ?? "—"}</td>
                <td className="py-3 pr-4">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${resultPill[e.result]}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${resultDot[e.result]}`} />
                    {e.result}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-slate-500">
                  {entries.length === 0 ? "No audit events yet." : "No events match your filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
