// Bundles the compiled CLI + server into a single self-contained `dist/` for npm.
// Inlines our own @rekha/* code; keeps third-party/native modules external
// (they are declared as real dependencies in the root package.json).
import { build } from "esbuild";
import { cpSync, rmSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const external = [
  "@clack/prompts",
  "@fastify/cookie",
  "@fastify/csrf-protection",
  "@fastify/helmet",
  "@fastify/rate-limit",
  "@fastify/static",
  "@fastify/websocket",
  "argon2",
  "better-sqlite3",
  "commander",
  "fastify",
  "picocolors",
  "pino",
  "pm2",
  "ws",
  "zod",
];

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

const common = {
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  external,
  define: { "process.env.REKHA_VERSION": JSON.stringify(version) },
  logLevel: "info",
};

// CLI entry (the `rekha` bin). esbuild preserves the entry's existing shebang.
await build({
  ...common,
  entryPoints: ["packages/cli/dist/index.js"],
  outfile: "dist/cli.js",
});

// Server entry (the PM2-managed process).
await build({
  ...common,
  entryPoints: ["packages/server/dist/main.js"],
  outfile: "dist/server.js",
});

// Static dashboard.
const webDist = "packages/web/dist";
if (!existsSync(webDist)) {
  throw new Error(`Missing ${webDist} — run the web build first (pnpm build).`);
}
cpSync(webDist, "dist/web", { recursive: true });

console.log(`\n✓ Bundled rekha@${version} → dist/ (cli.js, server.js, web/)`);
