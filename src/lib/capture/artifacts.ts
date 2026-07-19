import { randomUUID } from "node:crypto";
import { getBoardMediaBucket } from "@/lib/supabase/client";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import {
  captureTargetResultSchema,
  type CaptureJob,
  type CaptureTargetResult,
} from "@/lib/capture/schema";
import type { RawCapturePair, RawCaptureTargetResult } from "@/lib/capture/playwright-capture";
import { boardNodeSchema, type BoardNodeRecord } from "@/lib/validation/board";

export interface CaptureArtifactStorage {
  upload(path: string, body: Buffer): Promise<void>;
  remove(paths: string[]): Promise<void>;
}

export interface CaptureNodeStorage {
  nextLayout(boardId: string): Promise<{ positionX: number; zIndex: number }>;
  insert(nodes: BoardNodeRecord[]): Promise<BoardNodeRecord[]>;
}

export type CaptureArtifactDependencies = {
  storage: CaptureArtifactStorage;
  nodes: CaptureNodeStorage;
  now?: () => Date;
  uuid?: () => string;
};

function pngDimensions(buffer: Buffer) {
  if (
    buffer.length < 24 ||
    buffer.toString("ascii", 1, 4) !== "PNG" ||
    buffer.toString("ascii", 12, 16) !== "IHDR"
  ) {
    throw new Error("Playwright produced an invalid PNG artifact.");
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function displayBounds(buffer: Buffer) {
  const dimensions = pngDimensions(buffer);
  const width = Math.min(560, Math.max(360, dimensions.width / 2));
  const height = Math.min(600, Math.max(240, width * (dimensions.height / dimensions.width) + 96));
  return { ...dimensions, displayWidth: Math.round(width), displayHeight: Math.round(height) };
}

function targetLabel(target: "base" | "pr") {
  return target === "base" ? "Generated base capture" : "Generated PR capture";
}

function captureTitle(
  target: "base" | "pr",
  routePath: string,
  viewportName: string,
  variant: "Full page" | "Viewport",
) {
  return `${targetLabel(target)} · ${routePath} · ${viewportName} · ${variant}`.slice(0, 160);
}

function buildTargetArtifacts(input: {
  job: CaptureJob;
  target: "base" | "pr";
  result: RawCaptureTargetResult;
  columnX: number;
  zIndex: number;
  capturedAt: string;
  uuid: () => string;
}) {
  const { job, target, result, columnX, capturedAt, uuid } = input;
  const fullPath = `${job.board_id}/captures/${job.id}/${target}-full-page.png`;
  const viewportPath = `${job.board_id}/captures/${job.id}/${target}-viewport.png`;
  const full = displayBounds(result.fullPage);
  const viewport = displayBounds(result.viewportImage);
  const source = target === "base" ? "GENERATED_BASE_CAPTURE" : "GENERATED_PR_CAPTURE";
  const fullNodeId = uuid();
  const viewportNodeId = uuid();
  const common = {
    board_id: job.board_id,
    type: "image" as const,
    position_x: columnX,
    width: Math.max(full.displayWidth, viewport.displayWidth),
    locked: false,
    created_by: "capture-worker",
    created_at: capturedAt,
    updated_at: capturedAt,
  };
  const nodes: BoardNodeRecord[] = [
    boardNodeSchema.parse({
      ...common,
      id: fullNodeId,
      title: captureTitle(target, job.route_path, job.viewport.name, "Full page"),
      position_y: 80,
      height: full.displayHeight,
      z_index: input.zIndex,
      content: {
        kind: "image",
        storagePath: fullPath,
        fileName: `${target}-full-page.png`,
        mimeType: "image/png",
        sizeBytes: result.fullPage.byteLength,
        naturalWidth: full.width,
        naturalHeight: full.height,
        source,
        capture: {
          jobId: job.id,
          routePath: job.route_path,
          resolvedPath: job.resolved_path,
          variant: "FULL_PAGE",
          finalUrl: result.finalUrl,
          httpStatus: result.httpStatus,
          viewportName: job.viewport.name,
          capturedAt,
        },
      },
    }),
    boardNodeSchema.parse({
      ...common,
      id: viewportNodeId,
      title: captureTitle(target, job.route_path, job.viewport.name, "Viewport"),
      position_y: 80 + full.displayHeight + 60,
      height: viewport.displayHeight,
      z_index: input.zIndex + 1,
      content: {
        kind: "image",
        storagePath: viewportPath,
        fileName: `${target}-viewport.png`,
        mimeType: "image/png",
        sizeBytes: result.viewportImage.byteLength,
        naturalWidth: viewport.width,
        naturalHeight: viewport.height,
        source,
        capture: {
          jobId: job.id,
          routePath: job.route_path,
          resolvedPath: job.resolved_path,
          variant: "VIEWPORT",
          finalUrl: result.finalUrl,
          httpStatus: result.httpStatus,
          viewportName: job.viewport.name,
          capturedAt,
        },
      },
    }),
  ];
  const metadata: CaptureTargetResult = captureTargetResultSchema.parse({
    fullPageStoragePath: fullPath,
    viewportStoragePath: viewportPath,
    fullPageNodeId: fullNodeId,
    viewportNodeId,
    finalUrl: result.finalUrl,
    httpStatus: result.httpStatus,
    consoleErrors: result.consoleErrors,
    pageErrors: result.pageErrors,
    failedRequests: result.failedRequests,
    viewport: result.viewport,
    pageWidth: result.pageWidth,
    pageHeight: result.pageHeight,
    fullPageSizeBytes: result.fullPage.byteLength,
    viewportSizeBytes: result.viewportImage.byteLength,
    captureDurationMs: result.captureDurationMs,
  });
  return {
    paths: [fullPath, viewportPath],
    uploads: [
      { path: fullPath, body: result.fullPage },
      { path: viewportPath, body: result.viewportImage },
    ],
    nodes,
    metadata,
  };
}

export async function persistCaptureArtifacts(
  job: CaptureJob,
  capture: RawCapturePair,
  dependencies: CaptureArtifactDependencies,
) {
  const capturedAt = (dependencies.now ?? (() => new Date()))().toISOString();
  const uuid = dependencies.uuid ?? randomUUID;
  const layout = await dependencies.nodes.nextLayout(job.board_id);
  const base = buildTargetArtifacts({
    job,
    target: "base",
    result: capture.base,
    columnX: layout.positionX,
    zIndex: layout.zIndex,
    capturedAt,
    uuid,
  });
  const pr = buildTargetArtifacts({
    job,
    target: "pr",
    result: capture.pr,
    columnX: layout.positionX + 640,
    zIndex: layout.zIndex + 2,
    capturedAt,
    uuid,
  });
  const uploads = [...base.uploads, ...pr.uploads];
  const uploadedPaths: string[] = [];
  try {
    for (const artifact of uploads) {
      await dependencies.storage.upload(artifact.path, artifact.body);
      uploadedPaths.push(artifact.path);
    }
    await dependencies.nodes.insert([...base.nodes, ...pr.nodes]);
    return { base: base.metadata, pr: pr.metadata };
  } catch (error) {
    if (uploadedPaths.length > 0)
      await dependencies.storage.remove(uploadedPaths).catch(() => undefined);
    throw error;
  }
}

export function supabaseCaptureArtifactDependencies(): CaptureArtifactDependencies {
  const client = getSupabaseAdminClient();
  const bucket = client.storage.from(getBoardMediaBucket());
  return {
    storage: {
      async upload(path, body) {
        const { error } = await bucket.upload(path, body, {
          contentType: "image/png",
          cacheControl: "31536000",
          upsert: false,
        });
        if (error) throw new Error(`Could not upload capture artifact: ${error.message}`);
      },
      async remove(paths) {
        const { error } = await bucket.remove(paths);
        if (error) throw new Error(`Could not clean up capture artifacts: ${error.message}`);
      },
    },
    nodes: {
      async nextLayout(boardId) {
        const { data, error } = await client
          .from("board_nodes")
          .select("position_x,width,z_index")
          .eq("board_id", boardId);
        if (error) throw new Error(`Could not place capture nodes: ${error.message}`);
        const positionX =
          (data ?? []).reduce(
            (maximum, node) => Math.max(maximum, Number(node.position_x) + Number(node.width)),
            0,
          ) + 80;
        const zIndex =
          (data ?? []).reduce((maximum, node) => Math.max(maximum, Number(node.z_index)), 0) + 1;
        return { positionX, zIndex };
      },
      async insert(nodes) {
        const { data, error } = await client.from("board_nodes").insert(nodes).select();
        if (error) throw new Error(`Could not create capture nodes: ${error.message}`);
        return data.map((node) => boardNodeSchema.parse(node));
      },
    },
  };
}
