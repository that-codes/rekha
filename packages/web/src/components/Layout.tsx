import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { Capabilities } from "@rekha/shared";
import { useAuth } from "../store/auth.js";
import { wsClient } from "../api/ws.js";
import { Spinner } from "./ui.js";
import { Icon, type IconName } from "./icons.js";
import { RekhaMark, RekhaWordmark } from "./Logo.js";
import { SettingsDialog } from "../features/settings/Settings.js";

const baseNav: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: "/processes", label: "Processes", icon: "processes" },
];

export function Layout() {
  const { user, loading, load, logout, has } = useAuth();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!loading && !user) navigate("/login", { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user) wsClient.connect();
  }, [user]);

  if (loading) return <Spinner />;
  if (!user) return null;

  const links = [...baseNav];
  if (has(Capabilities.VIEW_DASHBOARD)) links.unshift({ to: "/", label: "Dashboard", icon: "dashboard", end: true });
  if (has(Capabilities.MANAGE_USERS)) links.push({ to: "/users", label: "Users", icon: "users" });
  if (has(Capabilities.VIEW_AUDIT)) links.push({ to: "/audit", label: "Audit", icon: "audit" });

  const roleBadge =
    user.role === "admin"
      ? "bg-emerald-500/15 text-emerald-300"
      : "bg-sky-500/15 text-sky-300";

  return (
    <div className="flex h-screen bg-rekha-bg">
      <aside className="flex w-60 flex-col border-r border-rekha-border bg-rekha-panel/60">
        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-5">
          <RekhaMark size={36} className="rounded-xl shadow-lg shadow-emerald-500/20" />
          <RekhaWordmark size={22} />
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-3 pt-2">
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
            Menu
          </div>
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-emerald-500/10 text-emerald-300"
                    : "text-slate-400 hover:bg-slate-700/40 hover:text-slate-100"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-emerald-400" />
                  )}
                  <Icon
                    name={l.icon}
                    className={isActive ? "text-emerald-400" : "text-slate-500 group-hover:text-slate-300"}
                  />
                  {l.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User card */}
        <div className="border-t border-rekha-border p-3">
          <div className="flex items-center gap-3 rounded-lg bg-slate-800/40 px-3 py-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-slate-600 to-slate-700 text-sm font-semibold uppercase text-slate-100">
              {user.email.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-slate-100" title={user.email}>{user.email}</div>
              <span className={`mt-0.5 inline-block rounded px-1.5 py-px text-[10px] font-medium capitalize ${roleBadge}`}>
                {user.role}
              </span>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-slate-200"
            >
              <Icon name="settings" width={16} height={16} />
              Settings
            </button>
            <button
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
              className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
            >
              <Icon name="logout" width={16} height={16} />
              Logout
            </button>
          </div>
          <div className="mt-3 text-center text-[10px] font-medium uppercase tracking-[0.2em] text-slate-600">
            Logs 360
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
