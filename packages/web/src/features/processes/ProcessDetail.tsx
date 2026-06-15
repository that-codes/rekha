import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ALL_PROCESS_ACTIONS,
  Capabilities,
  type CrashAnalytics,
  type MetricPoint,
  type MetricsWindow,
  type ProcessAccessEntry,
  type ProcessAction,
  type ProcessEvent,
  type ProcessInfo,
  type SafeUser,
  type WsServerMessage,
} from "@rekha/shared";
import { api } from "../../api/client.js";
import { wsClient } from "../../api/ws.js";
import { Button, Card, Spinner } from "../../components/ui.js";
import { Dialog } from "../../components/Dialog.js";
import { Chart } from "../../components/Chart.js";
import { LogViewer } from "../../components/LogViewer.js";
import { Icon, type IconName } from "../../components/icons.js";
import { useAuth } from "../../store/auth.js";
import { bytes, dateTime, duration } from "../../lib/format.js";

const WINDOWS: MetricsWindow[] = ["1h", "24h", "7d", "30d"];

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

export function ProcessDetail() {
  const { name = "" } = useParams();
  const qc = useQueryClient();
  const canManage = useAuth((s) => s.user?.capabilities.includes(Capabilities.MANAGE_USERS) ?? false);
  const canStart = useAuth((s) => s.canProcess(name, "start"));
  const canStop = useAuth((s) => s.canProcess(name, "stop"));
  const canRestart = useAuth((s) => s.canProcess(name, "restart"));
  const canReload = useAuth((s) => s.canProcess(name, "reload"));
  const canViewLogs = useAuth((s) => s.canProcess(name, "view_logs"));
  const [tab, setTab] = useState<"insights" | "logs" | "access">("insights");
  const [window, setWindow] = useState<MetricsWindow>("1h");
  const [busy, setBusy] = useState(false);

  const proc = useQuery({
    queryKey: ["process", name],
    queryFn: () => api.get<{ process: ProcessInfo }>(`/processes/${encodeURIComponent(name)}`),
    staleTime: 10_000,
  });

  // Live status/CPU/mem over WebSocket (replaces polling).
  useEffect(() => {
    const topic = `process:${name}:metrics`;
    wsClient.subscribe(topic);
    const off = wsClient.onMessage((msg: WsServerMessage) => {
      if (msg.topic === topic && msg.event === "update") {
        qc.setQueryData(["process", name], { process: msg.data as ProcessInfo });
      }
    });
    return () => {
      off();
      wsClient.unsubscribe(topic);
    };
  }, [name, qc]);

  async function act(action: "start" | "stop" | "restart" | "reload") {
    setBusy(true);
    try {
      await api.post(`/processes/${encodeURIComponent(name)}/${action}`);
      await qc.invalidateQueries({ queryKey: ["process", name] });
    } catch {
      alert(`Failed to ${action} ${name}`);
    } finally {
      setBusy(false);
    }
  }

  const p = proc.data?.process;

  return (
    <div className="flex h-full flex-col gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1 text-sm text-slate-500">
            <Link to="/processes" className="hover:text-slate-300">Processes</Link>
            <span>/</span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-slate-100">{name}</h1>
            {p && (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusPill[p.status] ?? statusPill.stopped}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${statusDot[p.status] ?? statusDot.stopped}`} />
                {p.status}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {canStart && <ActionBtn icon="play" label="Start" onClick={() => act("start")} disabled={busy} />}
          {canRestart && <ActionBtn icon="restart" label="Restart" onClick={() => act("restart")} disabled={busy} />}
          {canReload && <ActionBtn icon="reload" label="Reload" onClick={() => act("reload")} disabled={busy} />}
          {canStop && <ActionBtn icon="stop" label="Stop" onClick={() => act("stop")} disabled={busy} />}
        </div>
      </div>

      {/* Quick stats */}
      {p && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <QuickStat label="CPU" value={`${p.cpu}%`} />
          <QuickStat label="Memory" value={bytes(p.memory)} />
          <QuickStat label="Uptime" value={duration(p.uptimeMs)} />
          <QuickStat label="Restarts" value={String(p.restarts)} />
          <QuickStat label="PID" value={p.pid ? String(p.pid) : "—"} />
          <QuickStat label="Instances" value={`${p.instances} · ${p.execMode.replace("_mode", "")}`} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex w-fit gap-1 rounded-lg border border-rekha-border bg-rekha-panel/60 p-1">
        <TabButton active={tab === "insights"} onClick={() => setTab("insights")} icon="activity" label="Insights" />
        {canViewLogs && <TabButton active={tab === "logs"} onClick={() => setTab("logs")} icon="logs" label="Logs" />}
        {canManage && <TabButton active={tab === "access"} onClick={() => setTab("access")} icon="users" label="Access" />}
      </div>

      {tab === "insights" ? (
        <div className="flex-1 overflow-auto">
          <Insights name={name} window={window} setWindow={setWindow} />
        </div>
      ) : tab === "logs" ? (
        <Card className="flex min-h-0 flex-1 flex-col p-3">
          <LogViewer processName={name} />
        </Card>
      ) : (
        <div className="flex-1 overflow-auto">
          <ProcessAccess name={name} />
        </div>
      )}
    </div>
  );
}

function ProcessAccess({ name }: { name: string }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ mode: "add" } | { mode: "edit"; entry: ProcessAccessEntry } | null>(null);
  const access = useQuery({
    queryKey: ["access", name],
    queryFn: () => api.get<{ access: ProcessAccessEntry[] }>(`/processes/${encodeURIComponent(name)}/access`),
  });
  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get<{ users: SafeUser[] }>("/users") });

  async function remove(entry: ProcessAccessEntry) {
    if (!confirm(`Revoke ${entry.email}'s access to “${name}”?`)) return;
    await api.put(`/processes/${encodeURIComponent(name)}/access`, { userId: entry.userId, actions: [] });
    await qc.invalidateQueries({ queryKey: ["access", name] });
  }

  if (access.isLoading) return <Spinner />;
  const entries = access.data?.access ?? [];
  const granted = new Set(entries.map((e) => e.userId));
  // Admins implicitly have access; only non-admins need explicit grants.
  const candidates = (users.data?.users ?? []).filter((u) => u.role !== "admin" && u.status === "active" && !granted.has(u.id));

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Icon name="users" width={16} height={16} className="text-slate-400" /> Users with access
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Per-process permissions. Admins can always see every process.</p>
        </div>
        <Button variant="primary" disabled={candidates.length === 0} onClick={() => setDialog({ mode: "add" })}>
          <Icon name="plus" width={15} height={15} /> Grant access
        </Button>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-rekha-border bg-slate-800/30 px-4 py-10 text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-700/50">
            <Icon name="users" width={18} height={18} className="text-slate-400" />
          </div>
          <p className="text-sm text-slate-400">No users have been granted access yet.</p>
          <p className="mt-0.5 text-xs text-slate-500">Use “Grant access” to add a user and choose their permissions.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((e) => (
            <div
              key={e.userId}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-rekha-border bg-rekha-panel/40 px-3 py-2.5"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-700 text-xs font-semibold uppercase text-slate-100">
                {e.email.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-100" title={e.email}>{e.email}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {ALL_PROCESS_ACTIONS.filter((a) => e.actions.includes(a)).map((a) => (
                    <span key={a} className="rounded bg-emerald-500/10 px-1.5 py-px text-[10px] font-medium capitalize text-emerald-300">
                      {a.replace("_", " ")}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setDialog({ mode: "edit", entry: e })}
                  title="Edit permissions"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-700 hover:text-emerald-300"
                >
                  <Icon name="settings" width={15} height={15} />
                </button>
                <button
                  onClick={() => void remove(e)}
                  title="Revoke access"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
                >
                  <Icon name="trash" width={15} height={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialog && (
        <AccessDialog
          name={name}
          entry={dialog.mode === "edit" ? dialog.entry : null}
          candidates={candidates}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            await qc.invalidateQueries({ queryKey: ["access", name] });
            setDialog(null);
          }}
        />
      )}
    </Card>
  );
}

function AccessDialog({
  name,
  entry,
  candidates,
  onClose,
  onSaved,
}: {
  name: string;
  entry: ProcessAccessEntry | null;
  candidates: SafeUser[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = entry !== null;
  const [userId, setUserId] = useState<number>(entry?.userId ?? candidates[0]?.id ?? 0);
  const [actions, setActions] = useState<Set<ProcessAction>>(
    new Set(entry ? entry.actions : (["view", "view_logs"] as ProcessAction[])),
  );
  const [busy, setBusy] = useState(false);

  // Granting any action implies "view"; clearing the last non-view action clears view too.
  function toggle(a: ProcessAction) {
    const next = new Set(actions);
    if (next.has(a)) {
      next.delete(a);
      if (a !== "view" && next.size === 1 && next.has("view")) next.delete("view");
    } else {
      next.add(a);
      if (a !== "view") next.add("view");
    }
    setActions(next);
  }

  async function submit() {
    if (!userId) return;
    setBusy(true);
    try {
      await api.put(`/processes/${encodeURIComponent(name)}/access`, { userId, actions: [...actions] });
      onSaved();
    } catch {
      alert("Could not save permissions.");
      setBusy(false);
    }
  }

  const email = editing ? entry.email : candidates.find((u) => u.id === userId)?.email;

  return (
    <Dialog
      open
      onClose={onClose}
      title={editing ? "Edit permissions" : "Grant access"}
      description={`Process “${name}”${email ? ` · ${email}` : ""}`}
      size="lg"
    >
      <div className="space-y-4">
        {!editing && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">User</span>
            <select
              value={userId}
              onChange={(e) => setUserId(Number(e.target.value))}
              className="w-full rounded-lg border border-rekha-border bg-rekha-bg px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none"
            >
              {candidates.map((u) => (
                <option key={u.id} value={u.id}>{u.email}</option>
              ))}
            </select>
          </label>
        )}

        <div>
          <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-400">Permissions</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {ALL_PROCESS_ACTIONS.map((a) => {
              const checked = actions.has(a);
              return (
                <label
                  key={a}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm capitalize transition-colors ${
                    checked ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200" : "border-rekha-border bg-rekha-bg text-slate-300 hover:border-slate-600"
                  }`}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggle(a)} className="accent-emerald-500" />
                  {a.replace("_", " ")}
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-500">“View” is implied by any other permission.</p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={busy || !userId || actions.size === 0}>
            {busy ? "Saving…" : editing ? "Save changes" : "Grant access"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Insights({
  name,
  window,
  setWindow,
}: {
  name: string;
  window: MetricsWindow;
  setWindow: (w: MetricsWindow) => void;
}) {
  const metrics = useQuery({
    queryKey: ["metrics", name, window],
    queryFn: () => api.get<{ points: MetricPoint[] }>(`/processes/${encodeURIComponent(name)}/metrics?window=${window}`),
    refetchInterval: 10_000,
  });
  const crash = useQuery({
    queryKey: ["crash", name, window],
    queryFn: () => api.get<{ analytics: CrashAnalytics }>(`/processes/${encodeURIComponent(name)}/crash?window=${window}`),
  });
  const events = useQuery({
    queryKey: ["events", name],
    queryFn: () => api.get<{ events: ProcessEvent[] }>(`/processes/${encodeURIComponent(name)}/events`),
  });

  if (metrics.isLoading) return <Spinner />;
  const points = metrics.data?.points ?? [];
  const xs = points.map((p) => p.ts / 1000);
  const a = crash.data?.analytics;
  const lastCpu = points.at(-1)?.cpu ?? 0;
  const lastMem = points.at(-1)?.memory ?? 0;

  return (
    <div className="space-y-5">
      {/* Window filter */}
      <div className="flex w-fit gap-1 rounded-lg border border-rekha-border bg-rekha-panel/60 p-1">
        {WINDOWS.map((w) => (
          <button
            key={w}
            onClick={() => setWindow(w)}
            className={`rounded-md px-3 py-1 text-sm transition-colors ${
              window === w ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {w}
          </button>
        ))}
      </div>

      {/* Crash analytics */}
      {a && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <InsightCard icon="activity" accent="emerald" label="Availability" value={`${a.availability}%`} />
          <InsightCard icon="alert" accent="red" label="Crashes" value={a.totalCrashes} />
          <InsightCard icon="clock" accent="amber" label="Last crash" value={a.lastCrashTs ? dateTime(a.lastCrashTs) : "None"} small />
          <InsightCard icon="restart" accent="sky" label="Exit codes" value={Object.keys(a.exitCodes).length || "—"} />
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="CPU" accent="text-sky-400" current={`${lastCpu}%`}>
          <Chart title="" data={[xs, points.map((p) => p.cpu)] as never} series={[{ label: "CPU %", stroke: "#38bdf8" }]} height={220} />
        </ChartCard>
        <ChartCard title="Memory" accent="text-violet-400" current={bytes(lastMem)}>
          <Chart title="" data={[xs, points.map((p) => p.memory)] as never} series={[{ label: "Memory", stroke: "#a78bfa" }]} height={220} format={bytes} />
        </ChartCard>
      </div>

      {/* Events */}
      <Card>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Icon name="activity" width={16} height={16} className="text-slate-400" /> Recent events
        </div>
        <div className="max-h-72 space-y-1 overflow-auto">
          {(events.data?.events ?? []).map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
          {(events.data?.events ?? []).length === 0 && (
            <div className="py-6 text-center text-sm text-slate-500">No events recorded yet.</div>
          )}
        </div>
      </Card>
    </div>
  );
}

const eventColor: Record<string, string> = {
  online: "bg-emerald-400",
  start: "bg-emerald-400",
  restart: "bg-sky-400",
  stop: "bg-slate-500",
  exit: "bg-red-400",
  errored: "bg-red-400",
};

function EventRow({ event }: { event: ProcessEvent }) {
  return (
    <div className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-slate-800/40">
      <div className="flex items-center gap-3">
        <span className={`h-2 w-2 rounded-full ${eventColor[event.type] ?? "bg-slate-500"}`} />
        <span className="text-sm capitalize text-slate-200">{event.type}</span>
        {event.exitCode != null && <span className="text-xs text-slate-500">exit code {event.exitCode}</span>}
      </div>
      <span className="text-xs text-slate-500">{dateTime(event.ts)}</span>
    </div>
  );
}

const accents: Record<string, string> = {
  emerald: "bg-emerald-500/15 text-emerald-400",
  red: "bg-red-500/15 text-red-400",
  amber: "bg-amber-500/15 text-amber-400",
  sky: "bg-sky-500/15 text-sky-400",
};

function InsightCard({
  icon,
  accent,
  label,
  value,
  small,
}: {
  icon: IconName;
  accent: keyof typeof accents;
  label: string;
  value: React.ReactNode;
  small?: boolean;
}) {
  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
          <div className={`mt-2 font-semibold text-slate-50 ${small ? "text-base" : "text-2xl"}`}>{value}</div>
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${accents[accent]}`}>
          <Icon name={icon} width={18} height={18} />
        </div>
      </div>
    </Card>
  );
}

function ChartCard({ title, accent, current, children }: { title: string; accent: string; current: string; children: React.ReactNode }) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <span className={`text-sm font-semibold tabular-nums ${accent}`}>{current}</span>
      </div>
      {children}
    </Card>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-rekha-border bg-rekha-panel/40 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 truncate font-medium text-slate-100" title={value}>{value}</div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: IconName; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-emerald-500/15 text-emerald-300" : "text-slate-400 hover:text-slate-200"
      }`}
    >
      <Icon name={icon} width={15} height={15} />
      {label}
    </button>
  );
}

function ActionBtn({ icon, label, onClick, disabled }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="flex items-center gap-1.5 rounded-lg border border-rekha-border bg-rekha-panel/60 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:border-slate-600 hover:text-emerald-300 disabled:opacity-40"
    >
      <Icon name={icon} width={15} height={15} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
