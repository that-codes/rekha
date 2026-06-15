import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ALL_PROCESS_ACTIONS,
  type ProcessAction,
  type ProcessGrant,
  type ProcessInfo,
  type SafeUser,
} from "@rekha/shared";
import { api, ApiError } from "../../api/client.js";
import { Button, Card, Spinner } from "../../components/ui.js";
import { Dialog } from "../../components/Dialog.js";
import { Menu, MenuItem, MenuDivider } from "../../components/Menu.js";
import { PasswordInput } from "../../components/PasswordInput.js";
import { Icon } from "../../components/icons.js";
import { dateTime } from "../../lib/format.js";

const rolePill: Record<string, string> = {
  admin: "bg-emerald-500/15 text-emerald-300",
  developer: "bg-sky-500/15 text-sky-300",
};

const inputClass =
  "w-full rounded-lg border border-rekha-border bg-rekha-bg px-3 py-2 text-sm text-slate-200 focus:border-emerald-500 focus:outline-none";

function randInt(max: number): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0] ?? 0) % max;
}

/** Generates a strong password that always satisfies the policy (lower+upper+digit, 16 chars). */
function generatePassword(len = 16): string {
  const lower = "abcdefghijkmnpqrstuvwxyz"; // ambiguous chars omitted
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%^&*-_+=";
  const all = lower + upper + digits + symbols;
  const out: string[] = [
    lower.charAt(randInt(lower.length)),
    upper.charAt(randInt(upper.length)),
    digits.charAt(randInt(digits.length)),
    symbols.charAt(randInt(symbols.length)),
  ];
  while (out.length < len) out.push(all.charAt(randInt(all.length)));
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    const t = out[i]!;
    out[i] = out[j]!;
    out[j] = t;
  }
  return out.join("");
}

export function Users() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [permUser, setPermUser] = useState<SafeUser | null>(null);
  const [resetUser, setResetUser] = useState<SafeUser | null>(null);
  const [editUser, setEditUser] = useState<SafeUser | null>(null);

  const users = useQuery({ queryKey: ["users"], queryFn: () => api.get<{ users: SafeUser[] }>("/users") });
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api.get<{ roles: { name: string }[] }>("/roles") });
  const roleNames = roles.data?.roles.map((r) => r.name) ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["users"] });

  async function setStatus(u: SafeUser, status: "active" | "disabled") {
    await api.patch(`/users/${u.id}`, { status }).catch(() => alert("Update failed"));
    refresh();
  }
  async function remove(u: SafeUser) {
    if (!confirm(`Delete user "${u.email}"? This cannot be undone.`)) return;
    await api.del(`/users/${u.id}`).catch(() => alert("Delete failed"));
    refresh();
  }

  if (users.isLoading) return <Spinner />;
  const list = users.data?.users ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">Users</h1>
          <p className="mt-1 text-sm text-slate-500">{list.length} account{list.length === 1 ? "" : "s"}</p>
        </div>
        <Button variant="primary" onClick={() => setCreateOpen(true)}>
          <Icon name="plus" width={16} height={16} /> Add user
        </Button>
      </div>

      <Card className="p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-rekha-border text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-3 pl-4">User</th>
              <th className="py-3">Role</th>
              <th className="py-3">Status</th>
              <th className="py-3">Last login</th>
              <th className="w-12 py-3 pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="border-b border-rekha-border/40 last:border-0 hover:bg-slate-800/30">
                <td className="py-3 pl-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-700 text-sm font-semibold uppercase text-slate-100">
                      {u.email.slice(0, 1)}
                    </div>
                    <span className="font-medium text-slate-100">{u.email}</span>
                  </div>
                </td>
                <td className="py-3">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${rolePill[u.role] ?? "bg-slate-500/20 text-slate-300"}`}>
                    {u.role}
                  </span>
                </td>
                <td className="py-3">
                  <span className={`inline-flex items-center gap-1.5 text-xs ${u.status === "active" ? "text-emerald-300" : "text-red-300"}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${u.status === "active" ? "bg-emerald-400" : "bg-red-400"}`} />
                    {u.status}
                  </span>
                </td>
                <td className="py-3 text-slate-400">{u.lastLoginAt ? dateTime(u.lastLoginAt) : "Never"}</td>
                <td className="py-3 pr-4 text-right">
                  <Menu>
                    <MenuItem icon="audit" label="Permissions" onClick={() => setPermUser(u)} />
                    <MenuItem icon="settings" label="Change role" onClick={() => setEditUser(u)} />
                    <MenuItem icon="key" label="Reset password" onClick={() => setResetUser(u)} />
                    {u.status === "active" ? (
                      <MenuItem icon="power" label="Disable" onClick={() => setStatus(u, "disabled")} />
                    ) : (
                      <MenuItem icon="power" label="Enable" onClick={() => setStatus(u, "active")} />
                    )}
                    <MenuDivider />
                    <MenuItem icon="trash" label="Delete" danger onClick={() => remove(u)} />
                  </Menu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} roles={roleNames} onCreated={refresh} />
      {editUser && (
        <EditRoleDialog user={editUser} roles={roleNames} onClose={() => setEditUser(null)} onSaved={refresh} />
      )}
      {resetUser && <ResetPasswordDialog user={resetUser} onClose={() => setResetUser(null)} />}
      {permUser && (
        <Dialog open onClose={() => setPermUser(null)} title={`Permissions — ${permUser.email}`} description="Grant per-process access for this user." size="xl">
          <PermissionsEditor userId={permUser.id} isAdmin={permUser.role === "admin"} onSaved={() => setPermUser(null)} />
        </Dialog>
      )}
    </div>
  );
}

function CreateUserDialog({
  open,
  onClose,
  roles,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  roles: string[];
  onCreated: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("developer");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      await api.post("/users", { email, password, role });
      setEmail("");
      setPassword("");
      onCreated();
      onClose();
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "error";
      setError(code === "email_taken" ? "That email is already registered." : "Could not create user (check the password strength: 12+ chars, mixed case, a digit).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Add user" description="Create a new account and assign a role.">
      <div className="space-y-3">
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@example.com" className={inputClass} autoFocus />
        </Field>
        <Field label="Password">
          <PasswordInput
            value={password}
            onChange={setPassword}
            placeholder="Min 12 chars, mixed case + digit"
            className={inputClass}
            onGenerate={() => setPassword(generatePassword())}
          />
        </Field>
        <Field label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
            {roles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </Field>
        {error && <div className="text-sm text-red-400">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={busy || !email || !password}>
            {busy ? "Creating…" : "Create user"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function EditRoleDialog({
  user,
  roles,
  onClose,
  onSaved,
}: {
  user: SafeUser;
  roles: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [role, setRole] = useState(user.role);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    try {
      await api.patch(`/users/${user.id}`, { role });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError && err.code === "cannot_remove_last_admin" ? "Cannot demote the last admin." : "Update failed.");
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Change role — ${user.email}`}>
      <div className="space-y-3">
        <Field label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
            {roles.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </Field>
        {error && <div className="text-sm text-red-400">{error}</div>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save</Button>
        </div>
      </div>
    </Dialog>
  );
}

function ResetPasswordDialog({ user, onClose }: { user: SafeUser; onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function save() {
    setError(null);
    try {
      await api.post(`/users/${user.id}/reset-password`, { newPassword: password });
      setDone(true);
      setTimeout(onClose, 900);
    } catch {
      setError("Could not reset (check strength: 12+ chars, mixed case, a digit).");
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Reset password — ${user.email}`} description="The user's other sessions will be signed out.">
      <div className="space-y-3">
        <Field label="New password">
          <PasswordInput value={password} onChange={setPassword} className={inputClass} autoFocus />
        </Field>
        {error && <div className="text-sm text-red-400">{error}</div>}
        {done && <div className="text-sm text-emerald-400">Password reset.</div>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={!password || done}>Reset password</Button>
        </div>
      </div>
    </Dialog>
  );
}

function PermissionsEditor({ userId, isAdmin, onSaved }: { userId: number; isAdmin: boolean; onSaved: () => void }) {
  const qc = useQueryClient();
  const processes = useQuery({ queryKey: ["all-processes"], queryFn: () => api.get<{ processes: ProcessInfo[] }>("/processes") });
  const perms = useQuery({ queryKey: ["perms", userId], queryFn: () => api.get<{ grants: ProcessGrant[] }>(`/users/${userId}/permissions`) });
  const [draft, setDraft] = useState<Map<string, Set<ProcessAction>> | null>(null);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);

  if (isAdmin)
    return <div className="rounded-lg bg-slate-800/40 px-4 py-6 text-center text-sm text-slate-400">Admins have full access to all processes.</div>;
  if (processes.isLoading || perms.isLoading) return <Spinner />;

  const grants = draft ?? new Map(perms.data!.grants.map((g) => [g.processName, new Set(g.actions)]));
  const names = processes.data!.processes.map((p) => p.name);
  const visibleNames = names.filter((n) => n.toLowerCase().includes(filter.toLowerCase()));
  const grantedCount = names.filter((n) => (grants.get(n)?.size ?? 0) > 0).length;

  // Toggling any action implies "view"; clearing the last non-view action clears the row.
  function toggle(name: string, action: ProcessAction) {
    const next = new Map([...grants].map(([k, v]) => [k, new Set(v)]));
    const set = next.get(name) ?? new Set<ProcessAction>();
    if (set.has(action)) {
      set.delete(action);
      if (action !== "view" && set.size === 1 && set.has("view")) set.delete("view");
    } else {
      set.add(action);
      if (action !== "view") set.add("view");
    }
    next.set(name, set);
    setDraft(next);
  }

  async function save() {
    setBusy(true);
    const payload = {
      grants: [...grants]
        .map(([processName, actions]) => ({ processName, actions: [...actions] }))
        .filter((g) => g.actions.length > 0),
    };
    await api.put(`/users/${userId}/permissions`, payload);
    setDraft(null);
    await qc.invalidateQueries({ queryKey: ["perms", userId] });
    setBusy(false);
    onSaved();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-400">
          Each process below has its own permissions for this user.{" "}
          <span className="font-medium text-emerald-300">{grantedCount}</span> of {names.length} process{names.length === 1 ? "" : "es"} granted.
        </p>
        {names.length > 0 && (
          <div className="relative w-48">
            <Icon name="search" width={14} height={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find a process…"
              className="w-full rounded-lg border border-rekha-border bg-rekha-bg py-1.5 pl-8 pr-3 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            />
          </div>
        )}
      </div>

      <div className="max-h-[50vh] space-y-2 overflow-auto pr-1">
        {visibleNames.map((name) => {
          const actions = grants.get(name) ?? new Set<ProcessAction>();
          const active = actions.size > 0;
          return (
            <div
              key={name}
              className={`rounded-lg border px-3 py-2.5 transition-colors ${active ? "border-emerald-500/30 bg-emerald-500/5" : "border-rekha-border bg-rekha-panel/40"}`}
            >
              <div className="flex items-center gap-2">
                <Icon name="processes" width={15} height={15} className={active ? "text-emerald-400" : "text-slate-500"} />
                <span className="font-medium text-slate-100">{name}</span>
                {active && <span className="ml-auto text-[10px] uppercase tracking-wide text-emerald-300">{actions.size} granted</span>}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 pl-6">
                {ALL_PROCESS_ACTIONS.map((a) => (
                  <label key={a} className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200">
                    <input type="checkbox" checked={actions.has(a)} onChange={() => toggle(name, a)} className="accent-emerald-500" />
                    {a.replace("_", " ")}
                  </label>
                ))}
              </div>
            </div>
          );
        })}
        {names.length === 0 && <div className="rounded-lg bg-slate-800/40 px-4 py-8 text-center text-sm text-slate-500">No processes available.</div>}
        {names.length > 0 && visibleNames.length === 0 && (
          <div className="rounded-lg bg-slate-800/40 px-4 py-8 text-center text-sm text-slate-500">No processes match “{filter}”.</div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save permissions"}</Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
      {children}
    </label>
  );
}
