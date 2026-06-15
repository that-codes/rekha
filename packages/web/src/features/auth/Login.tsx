import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../store/auth.js";
import { Button } from "../../components/ui.js";
import { Icon } from "../../components/icons.js";
import { RekhaMark, RekhaWordmark } from "../../components/Logo.js";
import { PasswordInput } from "../../components/PasswordInput.js";
import { ApiError } from "../../api/client.js";

export function Login() {
  const { login, user, load } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "login_failed";
      setError(
        code === "account_locked"
          ? "Account temporarily locked. Try again later."
          : code === "account_disabled"
            ? "This account is disabled."
            : "Invalid email or password.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-rekha-bg p-4">
      {/* animated background glows */}
      <div className="rk-glow pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl" />
      <div className="rk-glow pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-sky-500/20 blur-3xl" style={{ animationDelay: "2s" }} />
      <div className="rk-grid pointer-events-none absolute inset-0 opacity-40" />

      <div className="relative z-10 grid w-full max-w-4xl overflow-hidden rounded-2xl border border-rekha-border bg-rekha-panel/70 shadow-2xl backdrop-blur-xl md:grid-cols-2">
        <MonitorPanel />
        <FormPanel
          email={email}
          password={password}
          setEmail={setEmail}
          setPassword={setPassword}
          error={error}
          busy={busy}
          onSubmit={submit}
        />
      </div>
    </div>
  );
}

/* ---------- Left: animated monitoring visual ---------- */

const fakeLogs: { lvl: "INF" | "WRN" | "ERR"; msg: string }[] = [
  { lvl: "INF", msg: "GET /api/v1/processes 200 4ms" },
  { lvl: "INF", msg: "worker-service online · pid 20413" },
  { lvl: "WRN", msg: "api-service memory 412MB (78%)" },
  { lvl: "INF", msg: "restart api-service ✓" },
  { lvl: "ERR", msg: "notifications exited code 1" },
  { lvl: "INF", msg: "metrics flushed · 1m bucket" },
  { lvl: "WRN", msg: "cpu spike worker-2 91%" },
  { lvl: "INF", msg: "GET /healthz 200 1ms" },
];

const lvlColor: Record<string, string> = {
  INF: "text-emerald-400",
  WRN: "text-amber-400",
  ERR: "text-red-400",
};

function Gauge({ label, value, color }: { label: string; value: number; color: string }) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - value / 100);
  return (
    <div className="relative h-24 w-24">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="6" />
        <circle
          className="rk-gauge"
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          style={{ strokeDashoffset: offset, ["--rk-c" as string]: `${c}` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold text-slate-100">{value}%</span>
        <span className="text-[10px] uppercase tracking-wide text-slate-500">{label}</span>
      </div>
    </div>
  );
}

function MonitorPanel() {
  return (
    <div className="relative hidden flex-col justify-between gap-6 overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-8 md:flex">
      {/* brand */}
      <div className="flex items-center gap-3">
        <RekhaMark size={46} variant="tile" className="rounded-xl shadow-lg shadow-emerald-500/30" />
        <RekhaWordmark size={32} />
      </div>

      {/* live CPU bars with scan line + sparkline */}
      <div className="relative rounded-xl border border-white/5 bg-black/30 p-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-400">Live metrics</span>
          <span className="flex items-center gap-1.5 text-[11px] text-emerald-300">
            <span className="rk-dot h-1.5 w-1.5 rounded-full bg-emerald-400" /> streaming
          </span>
        </div>
        <div className="flex items-center justify-around gap-4 py-1">
          <Gauge label="CPU" value={64} color="#34d399" />
          <Gauge label="MEM" value={41} color="#38bdf8" />
        </div>
        <svg viewBox="0 0 300 60" className="mt-3 h-12 w-full" preserveAspectRatio="none">
          <polyline
            className="rk-spark"
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            points="0,45 30,38 60,42 90,25 120,30 150,15 180,28 210,12 240,22 270,8 300,18"
          />
        </svg>
      </div>

      {/* scrolling log stream */}
      <div className="relative h-28 overflow-hidden rounded-xl border border-white/5 bg-black/30 p-3 font-mono text-[11px] leading-5">
        <div className="rk-scroll">
          {[...fakeLogs, ...fakeLogs].map((l, i) => (
            <div key={i} className="flex gap-2 whitespace-nowrap">
              <span className={`font-bold ${lvlColor[l.lvl]}`}>{l.lvl}</span>
              <span className="text-slate-400">{l.msg}</span>
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-slate-950 to-transparent" />
      </div>

      <div>
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400/80">
          Logs 360
        </div>
        <p className="text-sm leading-relaxed text-slate-400">
          Real-time process monitoring, analytics, and log streaming — self-hosted, with role-based access.
        </p>
      </div>
    </div>
  );
}

/* ---------- Right: login form ---------- */

function FormPanel({
  email,
  password,
  setEmail,
  setPassword,
  error,
  busy,
  onSubmit,
}: {
  email: string;
  password: string;
  setEmail: (v: string) => void;
  setPassword: (v: string) => void;
  error: string | null;
  busy: boolean;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const inputClass =
    "w-full rounded-lg border border-rekha-border bg-rekha-bg/80 py-2.5 pl-10 pr-3 text-sm text-slate-100 placeholder-slate-500 transition-colors focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20";

  return (
    <div className="flex flex-col justify-center p-8 sm:p-10">
      {/* mobile brand */}
      <div className="mb-6 flex items-center gap-2.5 md:hidden">
        <RekhaMark size={34} className="rounded-xl" />
        <RekhaWordmark size={20} />
      </div>

      <h1 className="text-2xl font-semibold text-slate-100">Welcome back</h1>
      <p className="mt-1 text-sm text-slate-500">Sign in to your monitoring dashboard.</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Email</label>
          <div className="relative">
            <Icon name="mail" width={16} height={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              autoFocus
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className={inputClass}
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-400">Password</label>
          <PasswordInput
            value={password}
            onChange={setPassword}
            placeholder="••••••••••••"
            className={inputClass}
            leftIcon={<Icon name="lock" width={16} height={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />}
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            <Icon name="alert" width={15} height={15} />
            {error}
          </div>
        )}

        <Button variant="primary" className="w-full justify-center py-2.5" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-slate-600">
        <Icon name="lock" width={12} height={12} />
        Secured with Argon2 · server-side sessions
      </div>
    </div>
  );
}
