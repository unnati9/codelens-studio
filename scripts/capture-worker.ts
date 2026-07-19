import { hostname } from "node:os";
import { runNextCaptureJob } from "../src/lib/capture/worker";

const once = process.argv.includes("--once");
const workerName = process.env.CAPTURE_WORKER_NAME?.trim() || `${hostname()}-${process.pid}`;
const pollingMs = Math.max(
  500,
  Math.min(Number(process.env.CAPTURE_POLL_INTERVAL_MS) || 2000, 30_000),
);
let stopping = false;

process.on("SIGINT", () => {
  stopping = true;
});
process.on("SIGTERM", () => {
  stopping = true;
});

async function main() {
  do {
    const job = await runNextCaptureJob(workerName);
    if (job) {
      console.log(`${job.id} ${job.status} ${job.route_path} ${job.viewport.name}`);
    } else if (!once && !stopping) {
      await new Promise((resolve) => setTimeout(resolve, pollingMs));
    }
  } while (!once && !stopping);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Capture worker failed.");
  process.exitCode = 1;
});
