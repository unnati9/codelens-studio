import { z } from "zod";
import {
  affectedRouteAnalysisResponseSchema,
  affectedRouteConfigResponseSchema,
  type AffectedRouteAnalysisResponse,
  type RepositoryRouteConfigInput,
} from "@/lib/affected-routes/schema";

const errorSchema = z.object({ error: z.object({ message: z.string().min(1) }) });

async function responseBody(response: Response, fallback: string) {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = errorSchema.safeParse(body);
    throw new Error(parsed.success ? parsed.data.error.message : fallback);
  }
  return body;
}

export async function analyzeBoardAffectedRoutes(
  boardId: string,
  force = false,
): Promise<AffectedRouteAnalysisResponse> {
  const response = await fetch("/api/affected-routes/analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ boardId, force }),
  });
  return affectedRouteAnalysisResponseSchema.parse(
    await responseBody(response, "Could not analyze affected routes."),
  );
}

export async function getRepositoryRouteConfig(boardId: string) {
  const response = await fetch(
    `/api/affected-routes/config?boardId=${encodeURIComponent(boardId)}`,
    {
      cache: "no-store",
    },
  );
  return affectedRouteConfigResponseSchema.parse(
    await responseBody(response, "Could not load repository route configuration."),
  );
}

export async function saveRepositoryRouteConfig(input: RepositoryRouteConfigInput) {
  const response = await fetch("/api/affected-routes/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return affectedRouteConfigResponseSchema.parse(
    await responseBody(response, "Could not save repository route configuration."),
  );
}
