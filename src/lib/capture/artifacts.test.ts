import { Buffer } from "node:buffer";
import { describe, expect, it, vi } from "vitest";
import { persistCaptureArtifacts } from "@/lib/capture/artifacts";
import { captureJobSchema, type CaptureJob } from "@/lib/capture/schema";
import type { RawCapturePair, RawCaptureTargetResult } from "@/lib/capture/playwright-capture";
import type { BoardNodeRecord } from "@/lib/validation/board";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function job(): CaptureJob {
  return captureJobSchema.parse({
    id: "10000000-0000-4000-8000-000000000001",
    board_id: "20000000-0000-4000-8000-000000000002",
    capture_config_id: null,
    route_path: "/products/[id]",
    resolved_path: "/products/example",
    head_sha: "0123456789abcdef0123456789abcdef01234567",
    base_sha: "1123456789abcdef0123456789abcdef01234567",
    scenario: "signed-out",
    viewport: {
      name: "Desktop",
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      isMobile: false,
      hasTouch: false,
    },
    capture_options: {},
    auth_config: {},
    base_url: "https://base.example.com/",
    preview_url: "https://pr.example.com/",
    capture_key: "a".repeat(64),
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
    created_by: "guest-1",
    created_at: "2026-07-19T10:00:00.000Z",
    updated_at: "2026-07-19T10:00:01.000Z",
  });
}

function target(finalUrl: string): RawCaptureTargetResult {
  return {
    fullPage: png,
    viewportImage: png,
    finalUrl,
    httpStatus: 200,
    consoleErrors: ["fixture console error"],
    pageErrors: [],
    failedRequests: [],
    viewport: job().viewport,
    pageWidth: 1440,
    pageHeight: 1800,
    captureDurationMs: 125,
  };
}

function pair(): RawCapturePair {
  return {
    base: target("https://base.example.com/products/example"),
    pr: target("https://pr.example.com/products/example"),
    durationMs: 250,
  };
}

const ids = [
  "30000000-0000-4000-8000-000000000003",
  "40000000-0000-4000-8000-000000000004",
  "50000000-0000-4000-8000-000000000005",
  "60000000-0000-4000-8000-000000000006",
];

describe("capture artifact persistence", () => {
  it("uploads four artifacts and creates existing ImageNode records with clear provenance", async () => {
    const upload = vi.fn(async () => undefined);
    const remove = vi.fn(async () => undefined);
    const insert = vi.fn(async (nodes: BoardNodeRecord[]) => nodes);
    let idIndex = 0;
    const result = await persistCaptureArtifacts(job(), pair(), {
      storage: { upload, remove },
      nodes: { nextLayout: async () => ({ positionX: 900, zIndex: 4 }), insert },
      now: () => new Date("2026-07-19T10:05:00.000Z"),
      uuid: () => ids[idIndex++],
    });

    expect(upload).toHaveBeenCalledTimes(4);
    expect(remove).not.toHaveBeenCalled();
    const inserted = insert.mock.calls[0][0];
    expect(inserted).toHaveLength(4);
    expect(inserted.map((node) => node.content.kind === "image" && node.content.source)).toEqual([
      "GENERATED_BASE_CAPTURE",
      "GENERATED_BASE_CAPTURE",
      "GENERATED_PR_CAPTURE",
      "GENERATED_PR_CAPTURE",
    ]);
    expect(inserted.map((node) => node.title)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Generated base capture"),
        expect.stringContaining("Generated PR capture"),
      ]),
    );
    expect(result.base.fullPageNodeId).toBe(ids[0]);
    expect(result.pr.viewportNodeId).toBe(ids[3]);
  });

  it("removes uploaded objects if ImageNode creation fails", async () => {
    const remove = vi.fn(async () => undefined);
    await expect(
      persistCaptureArtifacts(job(), pair(), {
        storage: { upload: async () => undefined, remove },
        nodes: {
          nextLayout: async () => ({ positionX: 0, zIndex: 1 }),
          insert: async () => {
            throw new Error("mocked node insert failed");
          },
        },
        uuid: (() => {
          let index = 0;
          return () => ids[index++];
        })(),
      }),
    ).rejects.toThrow("mocked node insert failed");
    expect(remove).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.stringContaining("base-full-page.png"),
        expect.stringContaining("pr-viewport.png"),
      ]),
    );
  });
});
