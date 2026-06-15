import type { ButtonHTMLAttributes, ReactNode } from "react";
import type { ProcessStatus } from "@rekha/shared";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-rekha-border bg-rekha-panel p-4 ${className}`}>
      {children}
    </div>
  );
}

type Variant = "default" | "primary" | "danger" | "ghost";
const variants: Record<Variant, string> = {
  default: "bg-slate-700 hover:bg-slate-600 text-slate-100",
  primary: "bg-emerald-600 hover:bg-emerald-500 text-white",
  danger: "bg-red-600 hover:bg-red-500 text-white",
  ghost: "bg-transparent hover:bg-slate-700 text-slate-300",
};

export function Button({
  variant = "default",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    />
  );
}

const statusColor: Record<string, string> = {
  online: "bg-emerald-500",
  stopped: "bg-slate-500",
  errored: "bg-red-500",
  launching: "bg-amber-500",
  stopping: "bg-amber-500",
};

export function StatusDot({ status }: { status: ProcessStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${statusColor[status] ?? "bg-slate-600"}`} />
      <span className="capitalize text-slate-300">{status}</span>
    </span>
  );
}

export function Spinner() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-slate-400">Loading…</div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-100">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
    </Card>
  );
}
