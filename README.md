# Rekha

> **Logs 360** — self-hosted PM2 monitoring, analytics, and control.

A security-first, open-source alternative to PM2 Plus. Monitor, manage, and stream logs for every PM2 process on a server, with multi-user, per-process role-based access control. **All data stays on your box.**

<p>
  <img alt="License" src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" />
  <img alt="Node" src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" />
  <img alt="Status" src="https://img.shields.io/badge/status-alpha-orange.svg" />
</p>

---

## Quick start

```bash
npm install -g rekha
rekha install
```

The installer asks for an admin email/password and a port, generates secrets, initializes the database, registers Rekha as a PM2-managed service, and starts it. Open the printed URL and sign in.

### Requirements

- **Node.js ≥ 20**
- **PM2** installed and managing the processes you want to monitor
- A Linux/macOS host (Rekha runs as a PM2-managed service)

## Features

- **Real-time dashboard** — live process counts, CPU, memory, restarts, system load, and host metadata (Node/PM2 versions, cores, uptime).
- **Process control** — start / stop / restart / reload / delete, individually or in bulk.
- **Insights** — CPU/memory trends, restart history, availability %, and crash analytics over 1h / 24h / 7d / 30d.
- **Live log streaming** — tail logs with search/regex, level filters, pause/resume, virtualized rendering, and download. Logs are read directly from PM2's own files; **Rekha stores no logs**.
- **Granular RBAC** — see [Access control](#access-control).
- **Security by default** — Argon2id password hashing, server-side revocable sessions, CSRF protection, strict CSP, brute-force lockout, rate limiting, and a full audit log.

## Access control

Rekha enforces permissions **entirely server-side** — the UI only mirrors what a user is allowed to do.

| Role | Access |
|---|---|
| **admin** | Full access to every process, plus user management, audit log, settings, and the dashboard. |
| **developer** | Only what's explicitly granted, **per process and per action**. |

A single user can be added to **multiple processes with different permissions on each**. The available per-process actions are: `view`, `view_logs`, `start`, `stop`, `restart`, `reload`, and `delete` (granting any action implies `view`). Capabilities such as **dashboard access** are role-level and assigned to admins by default.

Manage access from two places:
- **Users → Permissions** — set a user's permissions across all processes at once.
- **Process → Access tab** — grant/edit/revoke users for a single process via a permissions dialog.

## CLI

| Command | Description |
|---|---|
| `rekha install` | Interactive install wizard |
| `rekha start` / `stop` / `restart` | Service lifecycle |
| `rekha status` | Show service status, URL, and DB size |
| `rekha update` | Apply migrations and restart |
| `rekha backup` / `rekha restore <file>` | Snapshot / restore the database |
| `rekha reset-password [user]` | Host-side admin recovery |
| `rekha uninstall` | Remove the service (optionally data) |

## Deployment

Rekha binds to `127.0.0.1` by default. Terminate TLS at a reverse proxy and forward to the Rekha port — ready-to-use [`deploy/`](deploy/) configs are provided for **Nginx** ([`nginx.conf`](deploy/nginx.conf)) and **Caddy** ([`Caddyfile`](deploy/Caddyfile)), including WebSocket upgrade and trusted-proxy handling. After installing, run `pm2 startup` once so Rekha survives reboots.

## Architecture

A monorepo (pnpm workspaces) published as a single package:

| Package | Responsibility |
|---|---|
| [`packages/shared`](packages/shared) | Zod schemas, RBAC capabilities + domain types — one source of truth. |
| [`packages/server`](packages/server) | Fastify API, WebSocket hub, SQLite, PM2 integration, analytics + log pipelines. |
| [`packages/cli`](packages/cli) | The `rekha` command. |
| [`packages/web`](packages/web) | React 18 + Vite dashboard (built and served by the server). |

## Development

```bash
pnpm install
pnpm build                          # builds shared → server → cli → web
pnpm dev:server                     # run the API (REKHA_HOME=./.devhome)
pnpm dev:web                        # Vite dev server (proxies /api + /ws)

pnpm typecheck                      # type-check all packages
pnpm dist                           # build + bundle into dist/ (cli.js, server.js, web/)
```

## License

[AGPL-3.0-only](LICENSE).
