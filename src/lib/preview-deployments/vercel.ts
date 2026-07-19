import { z } from "zod";
import { PreviewDeploymentError, asPreviewDeploymentError } from "@/lib/preview-deployments/error";
import type {
  PreviewDeploymentDiscoveryInput,
  PreviewDeploymentProvider,
  PreviewDeploymentProviderConfig,
} from "@/lib/preview-deployments/provider";
import {
  previewConnectionResponseSchema,
  previewDeploymentDiscoverySchema,
  type PreviewDeploymentDiscovery,
} from "@/lib/preview-deployments/schema";
import {
  validatePreviewDeploymentUrl,
  vercelDeploymentUrl,
} from "@/lib/preview-deployments/safe-url";
import type { PreviewDeploymentStatus } from "@/lib/validation/board";

const vercelApiOrigin = "https://api.vercel.com";
const requestTimeoutMs = 12_000;

const vercelProjectSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
  })
  .passthrough();

const vercelDeploymentSchema = z
  .object({
    uid: z.string().min(1),
    projectId: z.string().min(1).optional(),
    url: z.string().min(1).nullable(),
    state: z.string().nullable().optional(),
    readyState: z.string().nullable().optional(),
    target: z.string().nullable().optional(),
    created: z.union([z.number(), z.string()]).optional(),
    createdAt: z.union([z.number(), z.string()]).optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
    gitSource: z
      .object({
        sha: z.string().optional(),
        ref: z.string().optional(),
      })
      .passthrough()
      .optional(),
    errorCode: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
  })
  .passthrough();

const vercelDeploymentsResponseSchema = z
  .object({ deployments: z.array(vercelDeploymentSchema) })
  .passthrough();

type VercelDeployment = z.infer<typeof vercelDeploymentSchema>;

function metadataString(deployment: VercelDeployment, key: string): string | null {
  const value = deployment.meta?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function deploymentCommitSha(deployment: VercelDeployment): string | null {
  const value = metadataString(deployment, "githubCommitSha") ?? deployment.gitSource?.sha ?? null;
  return value && /^[a-f0-9]{7,64}$/i.test(value) ? value : null;
}

function deploymentBranch(deployment: VercelDeployment): string | null {
  return (
    metadataString(deployment, "githubCommitRef") ??
    metadataString(deployment, "githubCommitRefName") ??
    deployment.gitSource?.ref ??
    null
  );
}

function deploymentTimestamp(deployment: VercelDeployment): number {
  const value = Number(deployment.createdAt ?? deployment.created ?? 0);
  return Number.isFinite(value) ? value : 0;
}

export function normalizeVercelDeploymentStatus(
  state: string | null | undefined,
): PreviewDeploymentStatus {
  switch (state?.toUpperCase()) {
    case "INITIALIZING":
    case "QUEUED":
      return "QUEUED";
    case "BUILDING":
      return "BUILDING";
    case "READY":
      return "READY";
    case "ERROR":
      return "FAILED";
    case "CANCELED":
    case "CANCELLED":
    case "DELETED":
      return "CANCELLED";
    case "BLOCKED":
      return "ACCESS_REQUIRED";
    default:
      return "FAILED";
  }
}

function errorMessage(body: unknown, fallback: string): string {
  if (
    typeof body === "object" &&
    body &&
    "error" in body &&
    typeof body.error === "object" &&
    body.error &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message;
  }
  return fallback;
}

export class VercelPreviewProvider implements PreviewDeploymentProvider {
  readonly provider = "VERCEL" as const;

  constructor(private readonly token = process.env.VERCEL_TOKEN?.trim() ?? "") {}

  private async request(pathname: string, searchParams?: URLSearchParams): Promise<unknown> {
    if (!this.token) {
      throw new PreviewDeploymentError(
        "VERCEL_ACCESS_REQUIRED",
        "VERCEL_TOKEN is not configured on the CodeLens server.",
        503,
      );
    }
    const url = new URL(pathname, vercelApiOrigin);
    if (url.origin !== vercelApiOrigin) {
      throw new PreviewDeploymentError(
        "UNSAFE_PROVIDER_REQUEST",
        "The provider request target is not allowed.",
        500,
      );
    }
    if (searchParams) url.search = searchParams.toString();

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.token}`,
          "User-Agent": "CodeLens-Studio",
        },
        cache: "no-store",
        redirect: "manual",
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
    } catch (error) {
      throw new PreviewDeploymentError(
        "VERCEL_NETWORK_FAILURE",
        error instanceof Error
          ? `Could not reach Vercel: ${error.message}`
          : "Could not reach Vercel.",
        502,
      );
    }

    if (response.status >= 300 && response.status < 400) {
      throw new PreviewDeploymentError(
        "VERCEL_REDIRECT_REJECTED",
        "Vercel unexpectedly redirected the API request.",
        502,
      );
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new PreviewDeploymentError(
        "MALFORMED_VERCEL_RESPONSE",
        "Vercel returned an unreadable response.",
        502,
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new PreviewDeploymentError(
        "VERCEL_ACCESS_REQUIRED",
        "The Vercel token cannot access this project or team.",
        403,
      );
    }
    if (response.status === 404) {
      throw new PreviewDeploymentError(
        "VERCEL_PROJECT_NOT_FOUND",
        "The configured Vercel project was not found.",
        404,
      );
    }
    if (!response.ok) {
      throw new PreviewDeploymentError(
        "VERCEL_API_ERROR",
        errorMessage(body, `Vercel returned status ${response.status}.`),
        response.status === 429 ? 429 : 502,
      );
    }
    return body;
  }

  private async listDeployments(
    config: PreviewDeploymentProviderConfig,
    filter: { sha?: string; branch?: string },
  ): Promise<VercelDeployment[]> {
    const query = new URLSearchParams({
      projectId: config.projectId,
      limit: "20",
    });
    if (config.teamId) query.set("teamId", config.teamId);
    if (filter.sha) query.set("sha", filter.sha);
    if (filter.branch) query.set("branch", filter.branch);
    const parsed = vercelDeploymentsResponseSchema.safeParse(
      await this.request("/v7/deployments", query),
    );
    if (!parsed.success) {
      throw new PreviewDeploymentError(
        "MALFORMED_VERCEL_RESPONSE",
        "Vercel returned malformed deployment data.",
        502,
      );
    }
    return parsed.data.deployments
      .filter((deployment) => deployment.target !== "production")
      .filter((deployment) => {
        const commitSha = deploymentCommitSha(deployment);
        if (filter.sha && commitSha && commitSha.toLowerCase() !== filter.sha.toLowerCase()) {
          return false;
        }
        const branch = deploymentBranch(deployment);
        return !filter.branch || !branch || branch === filter.branch;
      })
      .sort((left, right) => deploymentTimestamp(right) - deploymentTimestamp(left));
  }

  async testConnection(config: PreviewDeploymentProviderConfig) {
    validatePreviewDeploymentUrl(config.productionUrl);
    const query = new URLSearchParams();
    if (config.teamId) query.set("teamId", config.teamId);
    const project = vercelProjectSchema.safeParse(
      await this.request(`/v9/projects/${encodeURIComponent(config.projectId)}`, query),
    );
    if (!project.success || project.data.id !== config.projectId) {
      throw new PreviewDeploymentError(
        "MALFORMED_VERCEL_RESPONSE",
        "Vercel returned an unexpected project.",
        502,
      );
    }
    return previewConnectionResponseSchema.parse({
      ok: true,
      provider: this.provider,
      projectId: project.data.id,
      projectName: project.data.name,
    });
  }

  async discover(input: PreviewDeploymentDiscoveryInput): Promise<PreviewDeploymentDiscovery> {
    const lastCheckedAt = new Date().toISOString();
    let baseDeploymentUrl: string | null = null;
    try {
      baseDeploymentUrl = validatePreviewDeploymentUrl(input.productionUrl);
      let deployments = await this.listDeployments(input, { sha: input.headCommitSha });
      let matchType: "SHA" | "BRANCH" = "SHA";
      if (deployments.length === 0) {
        deployments = await this.listDeployments(input, { branch: input.headBranch });
        matchType = "BRANCH";
      }
      const deployment = deployments[0];
      if (!deployment) {
        return previewDeploymentDiscoverySchema.parse({
          provider: this.provider,
          baseDeploymentUrl,
          previewUrl: null,
          deploymentId: null,
          status: "NOT_FOUND",
          commitSha: input.headCommitSha,
          branch: input.headBranch,
          lastCheckedAt,
          failureReason: "No Vercel preview deployment matched the pull-request SHA or branch.",
          matchType: null,
        });
      }

      let status = normalizeVercelDeploymentStatus(deployment.readyState ?? deployment.state);
      let previewUrl: string | null = null;
      let failureReason = deployment.errorMessage ?? deployment.errorCode ?? null;
      if (deployment.url) {
        previewUrl = vercelDeploymentUrl(deployment.url);
      } else if (status === "READY") {
        status = "FAILED";
        failureReason = "Vercel marked the deployment ready but did not return a preview URL.";
      }
      if (status === "ACCESS_REQUIRED" && !failureReason) {
        failureReason = "Vercel blocked this deployment. Access must be granted in Vercel.";
      } else if (status === "FAILED" && !failureReason) {
        failureReason = "Vercel reported that this deployment failed.";
      } else if (status === "CANCELLED" && !failureReason) {
        failureReason = "Vercel reported that this deployment was cancelled.";
      }

      return previewDeploymentDiscoverySchema.parse({
        provider: this.provider,
        baseDeploymentUrl,
        previewUrl,
        deploymentId: deployment.uid,
        status,
        commitSha:
          deploymentCommitSha(deployment) ?? (matchType === "SHA" ? input.headCommitSha : null),
        branch: deploymentBranch(deployment) ?? input.headBranch,
        lastCheckedAt,
        failureReason,
        matchType,
      });
    } catch (error) {
      const normalized = asPreviewDeploymentError(error);
      return previewDeploymentDiscoverySchema.parse({
        provider: this.provider,
        baseDeploymentUrl,
        previewUrl: null,
        deploymentId: null,
        status: normalized.code === "VERCEL_ACCESS_REQUIRED" ? "ACCESS_REQUIRED" : "FAILED",
        commitSha: input.headCommitSha,
        branch: input.headBranch,
        lastCheckedAt,
        failureReason: normalized.message,
        matchType: null,
      });
    }
  }
}
