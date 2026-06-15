import { useState } from "react";
import { api, ApiError } from "../../api/client.js";
import { Button } from "../../components/ui.js";
import { Dialog } from "../../components/Dialog.js";
import { PasswordInput } from "../../components/PasswordInput.js";
import { useAuth } from "../../store/auth.js";

const inputClass =
  "w-full rounded-lg border border-rekha-border bg-rekha-bg px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none";

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function change() {
    setMsg(null);
    setBusy(true);
    try {
      await api.post("/auth/change-password", { currentPassword: current, newPassword: next });
      setMsg({ ok: true, text: "Password changed. Other sessions were signed out." });
      setCurrent("");
      setNext("");
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "error";
      setMsg({
        ok: false,
        text:
          code === "wrong_current_password"
            ? "Current password is incorrect."
            : "Could not change password (12+ chars, mixed case, a digit).",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Settings" description="Manage your account.">
      {/* Account */}
      <div className="mb-5 flex items-center gap-3 rounded-lg bg-slate-800/40 px-4 py-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-700 text-lg font-semibold uppercase text-slate-100">
          {user?.email.slice(0, 1)}
        </div>
        <div>
          <div className="font-medium text-slate-100">{user?.email}</div>
          <span className={`mt-0.5 inline-block rounded px-1.5 py-px text-[10px] font-medium capitalize ${user?.role === "admin" ? "bg-emerald-500/15 text-emerald-300" : "bg-sky-500/15 text-sky-300"}`}>
            {user?.role}
          </span>
        </div>
      </div>

      {/* Change password */}
      <div className="space-y-3">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">Change password</div>
        <PasswordInput value={current} onChange={setCurrent} placeholder="Current password" className={inputClass} />
        <PasswordInput value={next} onChange={setNext} placeholder="New password (min 12 chars)" className={inputClass} />
        {msg && <div className={`text-sm ${msg.ok ? "text-emerald-400" : "text-red-400"}`}>{msg.text}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="primary" onClick={change} disabled={busy || !current || !next}>
            {busy ? "Updating…" : "Update password"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
