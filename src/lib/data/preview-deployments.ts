import { z } from "zod";
import {
  previewConfigurationResponseSchema,
  previewConnectionResponseSchema,
  previewRefreshResponseSchema,
  type PreviewConnectionRequest,
  type PreviewConnectionResponse,
  type PreviewRefreshResponse,
  type RepositoryPreviewConfigInput,
} from "@/lib/preview-deployments/schema";

const previewErrorSchema = z.object({
  error: z.object({ code: z.string().min(1), message: z.string().min(1) }),
});

async function responseBody(response: Response, fallback: string): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = previewErrorSchema.safeParse(body);
    throw new Error(parsed.success ? parsed.data.error.message : fallback);
  }
  return body;
}

export async function getPreviewDeploymentConfiguration(boardId: string) {
  const response = await fetch(
    `/api/preview-deployments/config?boardId=${encodeURIComponent(boardId)}`,
    { cache: "no-store" },
  );
  return previewConfigurationResponseSchema.parse(
    await responseBody(response, "Could not load preview deployment configuration."),
  );
}

export async function savePreviewDeploymentConfiguration(input: RepositoryPreviewConfigInput) {
  const response = await fetch("/api/preview-deployments/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return previewConfigurationResponseSchema.parse(
    await responseBody(response, "Could not save preview deployment configuration."),
  );
}

export async function testPreviewDeploymentConnection(
  input: PreviewConnectionRequest,
): Promise<PreviewConnectionResponse> {
  const response = await fetch("/api/preview-deployments/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return previewConnectionResponseSchema.parse(
    await responseBody(response, "Could not connect to Vercel."),
  );
}

export async function refreshBoardPreviewDeployment(
  boardId: string,
): Promise<PreviewRefreshResponse> {
  const response = await fetch("/api/preview-deployments/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ boardId }),
  });
  return previewRefreshResponseSchema.parse(
    await responseBody(response, "Could not refresh the preview deployment."),
  );
}
