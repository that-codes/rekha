import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { SystemOverview, WsServerMessage } from "@rekha/shared";
import { api } from "../../api/client.js";
import { wsClient } from "../../api/ws.js";
import { Card, Spinner } from "../../components/ui.js";
import { Icon, type IconName } from "../../components/icons.js";
import { bytes, duration } from "../../lib/format.js";

const accents: Record<string, { chip: string; bar: string }> = {
  emerald: { chip: "bg-emerald-500/15 text-emerald-400", bar: "bg-emerald-400" },
  sky: { chip: "bg-sky-500/15 text-sky-400", bar: "bg-sky-400" },
  violet: { chip: "bg-violet-500/15 text-violet-400", bar: "bg-violet-400" },
  amber: { chip: "bg-amber-500/15 text-amber-400", bar: "bg-amber-400" },
};

export function Dashboard() {
  const [overview, setOverview] = useState<SystemOverview | null>(null);

  useEffect(() => {
    api.get<{ overview: SystemOverview | null }>("/system/overview").then((r) => setOverview(r.overview));
    wsClient.subscribe("overview");
    const off = wsClient.onMessage((msg: WsServerMessage) => {
      if (msg.topic === "overview" && msg.event === "update") setOverview(msg.data as SystemOverview);
    });
    return () => {
      off();
      wsClient.unsubscribe("overview");
    };
  }, []);

  if (!overview) return <Spinner />;
  const h = overview.host;
  const cpuCapacity = h.cpuCount * 100;
  const memUsedPct = overview.memory.total ? (overview.memory.used / overview.memory.total) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">{h.hostname} · live overview</p>
        </div>
        <span className="flex items-center gap-2 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
          </span>
          Live
        </span>
      </div>

      {/* Hero stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon="processes" accent="emerald" label="Processes" value={overview.totalProcesses}>
          <div className="mt-3 flex items-center gap-3 text-xs text-slate-400">
            <Dot color="bg-emerald-400" /> {overview.online} online
            <Dot color="bg-slate-500" /> {overview.stopped} stopped
            <Dot color="bg-red-400" /> {overview.errored} errored
          </div>
        </StatCard>

        <StatCard icon="cpu" accent="sky" label="Total CPU" value={`${overview.totalCpu}%`}>
          <Bar value={overview.totalCpu} max={cpuCapacity} color={accents.sky!.bar} />
          <div className="mt-1.5 text-xs text-slate-500">across {h.cpuCount} cores</div>
        </StatCard>

        <StatCard icon="memory" accent="violet" label="Memory" value={bytes(overview.memory.used)}>
          <Bar value={memUsedPct} max={100} color={accents.violet!.bar} />
          <div className="mt-1.5 text-xs text-slate-500">{memUsedPct.toFixed(0)}% of {bytes(overview.memory.total)}</div>
        </StatCard>

        <StatCard icon="clock" accent="amber" label="Server Uptime" value={duration(h.uptimeSeconds * 1000)}>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
            <Icon name="restart" width={13} height={13} /> {overview.totalRestarts} total restarts
          </div>
        </StatCard>
      </div>

      {/* Health + load */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Process Health</h2>
            <span className="text-xs text-slate-500">{overview.totalProcesses} processes</span>
          </div>
          <HealthBar online={overview.online} stopped={overview.stopped} errored={overview.errored} />
          <div className="mt-4 grid grid-cols-3 gap-3">
            <HealthStat label="Online" value={overview.online} color="text-emerald-400" dot="bg-emerald-400" />
            <HealthStat label="Stopped" value={overview.stopped} color="text-slate-300" dot="bg-slate-500" />
            <HealthStat label="Errored" value={overview.errored} color="text-red-400" dot="bg-red-400" />
          </div>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-200">System Load</h2>
          <div className="space-y-3">
            <LoadRow label="1 min" value={overview.load.one} cores={h.cpuCount} />
            <LoadRow label="5 min" value={overview.load.five} cores={h.cpuCount} />
            <LoadRow label="15 min" value={overview.load.fifteen} cores={h.cpuCount} />
          </div>
        </Card>
      </div>

      {/* Host meta */}
      <Card>
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Icon name="server" width={16} height={16} className="text-slate-400" />
          Host
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <Meta label="Hostname" value={h.hostname} />
          <Meta label="Platform" value={`${h.platform}/${h.arch}`} />
          <Meta label="Node.js" value={h.nodeVersion} />
          <Meta label="PM2" value={h.pm2Version ?? "—"} />
          <Meta label="Rekha" value={`v${h.rekhaVersion}`} />
          <Meta label="CPU cores" value={String(h.cpuCount)} />
        </div>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  accent,
  label,
  value,
  children,
}: {
  icon: IconName;
  accent: keyof typeof accents;
  label: string;
  value: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card className="transition-colors hover:border-slate-600">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
          <div className="mt-2 text-3xl font-semibold text-slate-50">{value}</div>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${accents[accent]!.chip}`}>
          <Icon name={icon} width={20} height={20} />
        </div>
      </div>
      {children}
    </Card>
  );
}

function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-700/60">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

function HealthBar({ online, stopped, errored }: { online: number; stopped: number; errored: number }) {
  const total = Math.max(1, online + stopped + errored);
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-700/40">
      {online > 0 && <div className="bg-emerald-400" style={{ width: seg(online) }} />}
      {stopped > 0 && <div className="bg-slate-500" style={{ width: seg(stopped) }} />}
      {errored > 0 && <div className="bg-red-400" style={{ width: seg(errored) }} />}
    </div>
  );
}

function HealthStat({ label, value, color, dot }: { label: string; value: number; color: string; dot: string }) {
  return (
    <div className="rounded-lg bg-slate-800/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        <Dot color={dot} /> {label}
      </div>
      <div className={`mt-1 text-xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function LoadRow({ label, value, cores }: { label: string; value: number; cores: number }) {
  const pct = cores > 0 ? Math.min(100, (value / cores) * 100) : 0;
  const color = pct > 90 ? "bg-red-400" : pct > 70 ? "bg-amber-400" : "bg-emerald-400";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="tabular-nums text-slate-300">{value.toFixed(2)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-700/60">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 truncate font-medium text-slate-200" title={value}>
        {value}
      </div>
    </div>
  );
}
