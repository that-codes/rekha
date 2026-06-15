#!/usr/bin/env node
import { Command } from "commander";
import pc from "picocolors";
import { REKHA_VERSION } from "@rekha/server/version";
import { install } from "./commands/install.js";
import { uninstall } from "./commands/uninstall.js";
import { start, stop, restart, status } from "./commands/lifecycle.js";
import { backup, restore, update, resetPassword } from "./commands/maintenance.js";

const program = new Command();

program
  .name("rekha")
  .description("Self-hosted PM2 monitoring, analytics, and control platform")
  .version(REKHA_VERSION, "-v, --version");

program.command("install").description("Interactive install wizard").action(run(install));
program.command("uninstall").description("Remove the Rekha service").action(run(uninstall));
program.command("start").description("Start the Rekha service").action(run(start));
program.command("stop").description("Stop the Rekha service").action(run(stop));
program.command("restart").description("Restart the Rekha service").action(run(restart));
program.command("status").description("Show Rekha status").action(run(status));
program.command("update").description("Apply migrations and restart").action(run(update));
program.command("backup").description("Create a database backup snapshot").action(run(backup));
program
  .command("restore")
  .argument("<file>", "path to a .db backup file")
  .description("Restore the database from a backup")
  .action(run(restore));
program
  .command("reset-password")
  .argument("[email]", "user to reset (defaults to the first admin)")
  .description("Reset a user's password (host-side recovery)")
  .action(run(resetPassword));

function run<A extends unknown[]>(fn: (...args: A) => unknown | Promise<unknown>) {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (err) {
      console.error(pc.red(`\nError: ${err instanceof Error ? err.message : String(err)}`));
      process.exit(1);
    }
  };
}

program.parseAsync(process.argv);
