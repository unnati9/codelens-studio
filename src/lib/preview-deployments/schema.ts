import { z } from "zod";
import {
  boardSchema,
  previewDeploymentProviderSchema,
  previewDeploymentStatusSchema,
} from "@/lib/validation/board";

const vercelProjectIdSchema = z
  .string()
  .trim()
  .regex(/^prj_[A-Za-z0-9_]+$/, "Enter a valid Vercel project ID.")
  .max(128);

const vercelTeamIdSchema = z
  .string()
  .trim()
  .regex(/^team_[A-Za-z0-9_]+$/, "Enter a valid Vercel team ID.")
  .max(128);

export const previewDeploymentMatchTypeSchema = z.enum(["SHA", "BRANCH"]);

export const previewDeploymentDiscoverySchema = z.object({
  provider: previewDeploymentProviderSchema,
  baseDeploymentUrl: z.url().nullable(),
  previewUrl: z.url().nullable(),
  deploymentId: z.string().min(1).max(255).nullable(),
  status: previewDeploymentStatusSchema,
  commitSha: z
    .string()
    .regex(/^[a-f0-9]{7,64}$/i)
    .nullable(),
  branch: z.string().min(1).max(1024).nullable(),
  lastCheckedAt: z.string().datetime({ offset: true }),
  failureReason: z.string().max(2048).nullable(),
  matchType: previewDeploymentMatchTypeSchema.nullable(),
});

export const repositoryPreviewConfigSchema = z.object({
  id: z.string().uuid(),
  github_owner: z.string().min(1).max(120),
  github_repository: z.string().min(1).max(240),
  provider: previewDeploymentProviderSchema,
  vercel_project_id: vercelProjectIdSchema.nullable(),
  vercel_team_id: vercelTeamIdSchema.nullable(),
  production_url: z.url().nullable(),
  enabled: z.boolean(),
  created_by: z.string().min(1),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const repositoryPreviewConfigInputSchema = z
  .object({
    boardId: z.string().uuid(),
    provider: previewDeploymentProviderSchema.default("VERCEL"),
    vercelProjectId: z.union([vercelProjectIdSchema, z.literal("")]).nullable(),
    vercelTeamId: z.union([vercelTeamIdSchema, z.literal("")]).nullable(),
    productionUrl: z.union([z.url(), z.literal("")]).nullable(),
    enabled: z.boolean(),
    createdBy: z.string().min(1).max(255),
  })
  .strict()
  .superRefine((config, context) => {
    if (!config.enabled) return;
    if (!config.vercelProjectId) {
      context.addIssue({
        code: "custom",
        path: ["vercelProjectId"],
        message: "A Vercel project ID is required when preview discovery is enabled.",
      });
    }
    if (!config.productionUrl) {
      context.addIssue({
        code: "custom",
        path: ["productionUrl"],
        message: "A production URL is required when preview discovery is enabled.",
      });
    }
  });

export const previewConfigurationQuerySchema = z.object({ boardId: z.string().uuid() }).strict();

export const previewConfigurationResponseSchema = z.object({
  board: boardSchema,
  config: repositoryPreviewConfigSchema.nullable(),
  tokenConfigured: z.boolean(),
});

export const previewConnectionRequestSchema = z
  .object({
    vercelProjectId: vercelProjectIdSchema,
    vercelTeamId: z.union([vercelTeamIdSchema, z.literal("")]).nullable(),
    productionUrl: z.url(),
  })
  .strict();

export const previewConnectionResponseSchema = z.object({
  ok: z.literal(true),
  provider: previewDeploymentProviderSchema,
  projectId: z.string().min(1),
  projectName: z.string().min(1),
});

export const previewRefreshRequestSchema = z.object({ boardId: z.string().uuid() }).strict();

export const previewRefreshResponseSchema = z.object({
  board: boardSchema,
  deployment: previewDeploymentDiscoverySchema,
});

export type PreviewDeploymentDiscovery = z.infer<typeof previewDeploymentDiscoverySchema>;
export type RepositoryPreviewConfig = z.infer<typeof repositoryPreviewConfigSchema>;
export type RepositoryPreviewConfigInput = z.infer<typeof repositoryPreviewConfigInputSchema>;
export type PreviewConnectionRequest = z.infer<typeof previewConnectionRequestSchema>;
export type PreviewConnectionResponse = z.infer<typeof previewConnectionResponseSchema>;
export type PreviewRefreshResponse = z.infer<typeof previewRefreshResponseSchema>;
