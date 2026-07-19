import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureBaseAndPr } from "@/lib/capture/playwright-capture";
import { captureJobSchema } from "@/lib/capture/schema";

let server: Server | null = null;

afterEach(async () => {
  vi.unstubAllEnvs();
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
});

function fixtureHtml() {
  return `<!doctype html><html><head><style>
    body { margin: 0; height: 1400px; font-family: sans-serif; }
    .animated { animation: pulse 1s infinite; }
    @keyframes pulse { from { opacity: .5 } to { opacity: 1 } }
  </style></head><body>
    <main data-capture-ready="true"><h1 class="animated">Deterministic fixture</h1><p>capture target</p></main>
    <script>console.error('fixture console error'); setTimeout(() => { throw new Error('fixture page error') }, 0)</script>
  </body></html>`;
}

describe("Playwright local capture fixture", () => {
  it("captures the same settings for base and PR with full-page and viewport metadata", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("CAPTURE_ALLOW_LOCALHOST", "true");
    server = createServer((request, response) => {
      response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store" });
      response.end(fixtureHtml().replace("capture target", request.headers.host ?? "fixture"));
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Fixture server did not start.");
    const origin = `http://127.0.0.1:${address.port}`;
    const job = captureJobSchema.parse({
      id: "10000000-0000-4000-8000-000000000001",
      board_id: "20000000-0000-4000-8000-000000000002",
      capture_config_id: null,
      route_path: "/fixture",
      resolved_path: "/fixture",
      head_sha: "0123456789abcdef0123456789abcdef01234567",
      base_sha: null,
      scenario: "local-fixture",
      viewport: { name: "Fixture", width: 800, height: 600 },
      capture_options: {
        readySelector: "[data-capture-ready=true]",
        delayAfterReadyMs: 25,
        timeoutMs: 10_000,
      },
      auth_config: {},
      base_url: origin,
      preview_url: origin,
      capture_key: "b".repeat(64),
      status: "RUNNING",
      attempt: 1,
      retry_of: null,
      rerun_of: null,
      claimed_by: "fixture-worker",
      queued_at: "2026-07-19T10:00:00.000Z",
      started_at: "2026-07-19T10:00:01.000Z",
      completed_at: null,
      capture_duration_ms: null,
      base_result: null,
      pr_result: null,
      error_code: null,
      error_message: null,
      created_by: "fixture",
      created_at: "2026-07-19T10:00:00.000Z",
      updated_at: "2026-07-19T10:00:01.000Z",
    });

    const result = await captureBaseAndPr(job);
    expect(result.base.httpStatus).toBe(200);
    expect(result.pr.httpStatus).toBe(200);
    expect(result.base.viewport).toEqual(result.pr.viewport);
    expect(result.base.pageHeight).toBeGreaterThan(job.viewport.height);
    expect(result.base.fullPage.byteLength).toBeGreaterThan(result.base.viewportImage.byteLength);
    expect(result.base.finalUrl).toBe(`${origin}/fixture`);
    expect(result.base.consoleErrors).toContain("fixture console error");
    expect(result.base.pageErrors).toContain("fixture page error");
    expect(result.durationMs).toBeGreaterThan(0);
  }, 30_000);
});
