import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Capabilities, type ProcessInfo, type WsServerMessage } from "@rekha/shared";
import { api } from "../../api/client.js";
import { wsClient } from "../../api/ws.js";
import { useAuth } from "../../store/auth.js";
import { Card, Spinner } from "../../components/ui.js";
import { Icon, type IconName } from "../../components/icons.js";
import { bytes, duration } from "../../lib/format.js";

type Action = "start" | "stop" | "restart" | "reload" | "delete";

const statusPill: Record<string, string> = {
  online: "bg-emerald-500/15 text-emerald-300",
  stopped: "bg-slate-500/20 text-slate-300",
  errored: "bg-red-500/15 text-red-300",
  launching: "bg-amber-500/15 text-amber-300",
  stopping: "bg-amber-500/15 text-amber-300",
};
const statusDot: Record<string, string> = {
  online: "bg-emerald-400",
  stopped: "bg-slate-500",
  errored: "bg-red-400",
  launching: "bg-amber-400",
  stopping: "bg-amber-400",
};

export function Processes() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Grant-aware gating: admins bypass, developers see only their granted actions.
  const grants = useAuth((s) => s.grants);
  const capabilities = useAuth((s) => s.user?.capabilities);
  const can = useCallback(
    (name: string, action: Action) => {
      if (capabilities?.includes(Capabilities.MANAGE_ALL_PROCESSES)) return true;
      return grants.find((g) => g.processName === name)?.actions.includes(action) ?? false;
    },
    [grants, capabilities],
  );
  const canBulk = (action: Action, names: string[]) => names.length > 0 && names.every((n) => can(n, action));

  const { data, isLoading } = useQuery({
    queryKey: ["processes"],
    queryFn: () => api.get<{ processes: ProcessInfo[] }>("/processes"),
    staleTime: 10_000,
  });

  // Live updates over WebSocket (replaces polling); REST is just initial load + post-action refresh.
  useEffect(() => {
    wsClient.subscribe("processes");
    const off = wsClient.onMessage((msg: WsServerMessage) => {
      if (msg.topic === "processes" && msg.event === "update") {
        qc.setQueryData(["processes"], { processes: msg.data as ProcessInfo[] });
      }
    });
    return () => {
      off();
      wsClient.unsubscribe("processes");
    };
  }, [qc]);

  const processes = data?.processes ?? [];
  const counts = useMemo(() => {
    let online = 0, stopped = 0, errored = 0;
    for (const p of processes) {
      if (p.status === "online") online++;
      else if (p.status === "errored") errored++;
      else stopped++;
    }
    return { online, stopped, errored };
  }, [processes]);

  const maxMem = useMemo(() => Math.max(1, ...processes.map((p) => p.memory)), [processes]);

  const filtered = useMemo(
    () =>
      processes.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) &&
          (statusFilter === "all" || p.status === statusFilter),
      ),
    [processes, search, statusFilter],
  );

  async function act(name: string, action: Action) {
    if (action === "delete" && !confirm(`Delete process "${name}"?`)) return;
    setBusy(true);
    try {
      await api.post(`/processes/${encodeURIComponent(name)}/${action}`);
      await qc.invalidateQueries({ queryKey: ["processes"] });
    } catch {
      alert(`Failed to ${action} ${name}`);
    } finally {
      setBusy(false);
    }
  }

  async function bulk(action: Action) {
    if (selected.size === 0) return;
    if (action === "delete" && !confirm(`Delete ${selected.size} processes?`)) return;
    setBusy(true);
    try {
      await api.post("/processes/bulk", { action, names: [...selected] });
      setSelected(new Set());
      await qc.invalidateQueries({ queryKey: ["processes"] });
    } finally {
      setBusy(false);
    }
  }

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((p) => p.name))));
  }

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Processes</h1>
          <p className="mt-1 text-sm text-slate-500">{processes.length} managed by PM2</p>
        </div>
        <div className="flex items-center gap-2">
          <Chip color="bg-emerald-400" label="online" value={counts.online} />
          <Chip color="bg-slate-500" label="stopped" value={counts.stopped} />
          <Chip color="bg-red-400" label="errored" value={counts.errored} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Icon name="search" width={16} height={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter processes…"
            className="w-full rounded-lg border border-rekha-border bg-rekha-panel/60 py-2 pl-9 pr-3 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-rekha-border bg-rekha-panel/60 px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
        >
          <option value="all">All statuses</option>
          <option value="online">Online</option>
          <option value="stopped">Stopped</option>
          <option value="errored">Errored</option>
        </select>
      </div>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-2.5">
          <span className="text-sm text-slate-200">{selected.size} selected</span>
          <div className="flex items-center gap-2">
            {canBulk("start", [...selected]) && <BulkBtn icon="play" label="Start" onClick={() => bulk("start")} disabled={busy} />}
            {canBulk("restart", [...selected]) && <BulkBtn icon="restart" label="Restart" onClick={() => bulk("restart")} disabled={busy} />}
            {canBulk("stop", [...selected]) && <BulkBtn icon="stop" label="Stop" onClick={() => bulk("stop")} disabled={busy} />}
            <button onClick={() => setSelected(new Set())} className="text-sm text-slate-400 hover:text-slate-200">
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-rekha-border text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="w-10 py-3 pl-4">
                <input
                  type="checkbox"
                  checked={filtered.length > 0 && selected.size === filtered.length}
                  onChange={toggleAll}
                  className="accent-emerald-500"
                />
              </th>
              <th className="py-3">Name</th>
              <th className="py-3">Status</th>
              <th className="py-3">CPU</th>
              <th className="py-3">Memory</th>
              <th className="py-3">Uptime</th>
              <th className="py-3">Restarts</th>
              <th className="py-3 pr-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr key={p.name} className="group border-b border-rekha-border/40 last:border-0 hover:bg-slate-800/30">
                <td className="py-3 pl-4">
                  <input
                    type="checkbox"
                    checked={selected.has(p.name)}
                    onChange={() => toggle(p.name)}
                    className="accent-emerald-500"
                  />
                </td>
                <td className="py-3">
                  <Link to={`/processes/${encodeURIComponent(p.name)}`} className="font-medium text-slate-100 hover:text-emerald-300">
                    {p.name}
                  </Link>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-500">
                    {p.version && <span>v{p.version}</span>}
                    {p.env && <span className="rounded bg-slate-700/50 px-1.5 py-px">{p.env}</span>}
                    {p.assigned === false && (
                      <span className="rounded bg-amber-900/50 px-1.5 py-px text-amber-300">unassigned</span>
                    )}
                  </div>
                </td>
                <td className="py-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusPill[p.status] ?? statusPill.stopped}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${statusDot[p.status] ?? statusDot.stopped}`} />
                    {p.status}
                  </span>
                </td>
                <td className="py-3">
                  <MiniBar value={Math.min(100, p.cpu)} max={100} label={`${p.cpu}%`} color="bg-sky-400" />
                </td>
                <td className="py-3">
                  <MiniBar value={p.memory} max={maxMem} label={bytes(p.memory)} color="bg-violet-400" />
                </td>
                <td className="py-3 text-slate-300">{duration(p.uptimeMs)}</td>
                <td className="py-3 text-slate-300">{p.restarts}</td>
                <td className="py-3 pr-4">
                  <div className="flex justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                    {can(p.name, "start") && <IconBtn icon="play" title="Start" onClick={() => act(p.name, "start")} disabled={busy} />}
                    {can(p.name, "restart") && <IconBtn icon="restart" title="Restart" onClick={() => act(p.name, "restart")} disabled={busy} />}
                    {can(p.name, "reload") && <IconBtn icon="reload" title="Reload" onClick={() => act(p.name, "reload")} disabled={busy} />}
                    {can(p.name, "stop") && <IconBtn icon="stop" title="Stop" onClick={() => act(p.name, "stop")} disabled={busy} />}
                    {can(p.name, "delete") && <IconBtn icon="trash" title="Delete" danger onClick={() => act(p.name, "delete")} disabled={busy} />}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500">
                  {processes.length === 0 ? "No processes visible to you." : "No processes match your filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Chip({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-slate-800/60 px-3 py-1 text-xs text-slate-300">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className="font-semibold text-slate-100">{value}</span> {label}
    </span>
  );
}

function MiniBar({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 tabular-nums text-slate-300">{label}</span>
      <div className="h-1 w-16 overflow-hidden rounded-full bg-slate-700/60">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function IconBtn({
  icon,
  title,
  onClick,
  disabled,
  danger,
}: {
  icon: IconName;
  title: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-700 disabled:opacity-40 ${
        danger ? "hover:text-red-300" : "hover:text-emerald-300"
      }`}
    >
      <Icon name={icon} width={15} height={15} />
    </button>
  );
}

function BulkBtn({ icon, label, onClick, disabled }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-md bg-slate-700/60 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:bg-slate-600 disabled:opacity-40"
    >
      <Icon name={icon} width={14} height={14} />
      {label}
    </button>
  );
}
