import { create } from "zustand";
import { Capabilities, type Capability, type ProcessAction, type ProcessGrant, type SafeUser } from "@rekha/shared";
import { api, setCsrfToken } from "../api/client.js";

interface AuthState {
  user: SafeUser | null;
  grants: ProcessGrant[];
  loading: boolean;
  load: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  has: (cap: Capability) => boolean;
  /** Whether the current user may perform `action` on a given process. */
  canProcess: (processName: string, action: ProcessAction) => boolean;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  grants: [],
  loading: true,
  async load() {
    try {
      const data = await api.get<{ user: SafeUser; grants: ProcessGrant[]; csrfToken: string }>("/auth/me");
      setCsrfToken(data.csrfToken);
      set({ user: data.user, grants: data.grants, loading: false });
    } catch {
      set({ user: null, grants: [], loading: false });
    }
  },
  async login(email, password) {
    const data = await api.post<{ user: SafeUser; csrfToken: string }>("/auth/login", { email, password });
    setCsrfToken(data.csrfToken);
    await get().load();
  },
  async logout() {
    await api.post("/auth/logout").catch(() => undefined);
    setCsrfToken(null);
    set({ user: null, grants: [] });
  },
  has(cap) {
    return get().user?.capabilities.includes(cap) ?? false;
  },
  canProcess(processName, action) {
    const user = get().user;
    if (!user) return false;
    // Admins (manage_all_processes) bypass per-process grants entirely.
    if (user.capabilities.includes(Capabilities.MANAGE_ALL_PROCESSES)) return true;
    const grant = get().grants.find((g) => g.processName === processName);
    return grant?.actions.includes(action) ?? false;
  },
}));
