import { runMain } from "cf";
import { portfolioConfig } from "./cloudflare-config.mjs";

// cf defaults to remote storage. This command is deliberately local-only.
const database = portfolioConfig("development").worker.env.HISTORY.id;
try {
  await runMain([
    "d1",
    "migrations",
    "apply",
    database,
    "--dir",
    "worker/migrations",
    "--mode",
    "development",
    "--local",
    "--persist-to",
    ".cloudflare/state",
  ]);
  // The pinned beta leaves local runtime handles open after successful cleanup.
  // Exit only after cf has completed its migration and disposal promise.
  process.exit(0);
} catch {
  process.exit(1);
}
