import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// In the published bundle, esbuild replaces process.env.REKHA_VERSION with the
// root package version (define). In dev (unbundled), fall back to reading the
// package.json next to this module. The specifier is a variable so esbuild
// leaves the require as a runtime call rather than inlining the JSON.
let version = process.env.REKHA_VERSION ?? "";
if (!version) {
  try {
    const pkgPath = "../package.json";
    version = (require(pkgPath) as { version: string }).version;
  } catch {
    version = "0.0.0";
  }
}

export const REKHA_VERSION = version;
