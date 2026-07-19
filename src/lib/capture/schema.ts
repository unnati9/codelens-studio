import { z } from "zod";

const routePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((path) => path.startsWith("/"), "Capture routes must start with a slash.");

const selectorSchema = z.string().trim().min(1).max(500);

export const captureJobStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "STALE",
]);

export const captureViewportSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    width: z.number().int().min(320).max(2560),
    height: z.number().int().min(240).max(1440),
    deviceScaleFactor: z.number().min(0.5).max(3).default(1),
    isMobile: z.boolean().default(false),
    hasTouch: z.boolean().default(false),
  })
  .strict();

export const captureOptionsSchema = z
  .object({
    disableAnimations: z.boolean().default(true),
    reducedMotion: z.enum(["reduce", "no-preference"]).default("reduce"),
    waitForFonts: z.boolean().default(true),
    readySelector: selectorSchema.nullable().default(null),
    delayAfterReadyMs: z.number().int().min(0).max(10_000).default(250),
    locale: z.string().trim().min(2).max(35).default("en-US"),
    timezoneId: z.string().trim().min(1).max(100).default("UTC"),
    colorScheme: z.enum(["light", "dark", "no-preference"]).default("light"),
    maskSelectors: z.array(selectorSchema).max(25).default([]),
    hideSelectors: z.array(selectorSchema).max(25).default([]),
    timeoutMs: z.number().int().min(5_000).max(120_000).default(45_000),
  })
  .strict();

export const loginSetupStepSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("goto"),
      path: routePathSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("fill"),
      selector: selectorSchema,
      valueEnv: z
        .string()
        .trim()
        .regex(/^[A-Z][A-Z0-9_]{1,127}$/, "Use an environment-variable name."),
    })
    .strict(),
  z
    .object({
      action: z.literal("click"),
      selector: selectorSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("waitFor"),
      selector: selectorSchema,
      state: z.enum(["attached", "detached", "visible", "hidden"]).default("visible"),
    })
    .strict(),
]);

export const captureConfigSchema = z.object({
  id: z.string().uuid(),
  github_owner: z.string().min(1).max(120),
  github_repository: z.string().min(1).max(240),
  capture_options: captureOptionsSchema,
  viewports: z.array(captureViewportSchema).min(1).max(8),
  storage_state_env_var: z
    .string()
    .regex(/^[A-Z][A-Z0-9_]{1,127}$/)
    .nullable(),
  login_setup: z.array(loginSetupStepSchema).max(20),
  created_by: z.string().min(1).max(255),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const captureConfigInputSchema = z
  .object({
    boardId: z.string().uuid(),
    options: captureOptionsSchema,
    viewports: z.array(captureViewportSchema).min(1).max(8),
    storageStateEnvVar: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_]{1,127}$/, "Use an environment-variable name.")
      .nullable(),
    loginSetup: z.array(loginSetupStepSchema).max(20),
    createdBy: z.string().min(1).max(255),
  })
  .strict();

export const captureAuthConfigSchema = z
  .object({
    storageStateEnvVar: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]{1,127}$/)
      .nullable()
      .default(null),
    loginSetup: z.array(loginSetupStepSchema).max(20).default([]),
  })
  .strict();

export const capturedRequestFailureSchema = z.object({
  url: z.url(),
  method: z.string().min(1).max(20),
  resourceType: z.string().min(1).max(50),
  errorText: z.string().min(1).max(2000),
});

export const captureTargetResultSchema = z.object({
  fullPageStoragePath: z.string().min(1),
  viewportStoragePath: z.string().min(1),
  fullPageNodeId: z.string().uuid(),
  viewportNodeId: z.string().uuid(),
  finalUrl: z.url(),
  httpStatus: z.number().int().min(100).max(599).nullable(),
  consoleErrors: z.array(z.string().max(4000)).max(100),
  pageErrors: z.array(z.string().max(4000)).max(100),
  failedRequests: z.array(capturedRequestFailureSchema).max(100),
  viewport: captureViewportSchema,
  pageWidth: z.number().int().positive(),
  pageHeight: z.number().int().positive(),
  fullPageSizeBytes: z.number().int().positive(),
  viewportSizeBytes: z.number().int().positive(),
  captureDurationMs: z.number().int().nonnegative(),
});

export const captureJobSchema = z.object({
  id: z.string().uuid(),
  board_id: z.string().uuid(),
  capture_config_id: z.string().uuid().nullable(),
  route_path: routePathSchema,
  resolved_path: routePathSchema,
  head_sha: z.string().regex(/^[a-f0-9]{7,64}$/i),
  base_sha: z
    .string()
    .regex(/^[a-f0-9]{7,64}$/i)
    .nullable(),
  scenario: z.string().min(1).max(120),
  viewport: captureViewportSchema,
  capture_options: captureOptionsSchema,
  auth_config: captureAuthConfigSchema,
  base_url: z.url(),
  preview_url: z.url(),
  capture_key: z.string().min(32).max(128),
  status: captureJobStatusSchema,
  attempt: z.number().int().min(1).max(20),
  retry_of: z.string().uuid().nullable(),
  rerun_of: z.string().uuid().nullable(),
  claimed_by: z.string().nullable(),
  queued_at: z.string().datetime({ offset: true }),
  started_at: z.string().datetime({ offset: true }).nullable(),
  completed_at: z.string().datetime({ offset: true }).nullable(),
  capture_duration_ms: z.number().int().nonnegative().nullable(),
  base_result: captureTargetResultSchema.nullable(),
  pr_result: captureTargetResultSchema.nullable(),
  error_code: z.string().max(120).nullable(),
  error_message: z.string().max(4000).nullable(),
  created_by: z.string().min(1).max(255),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const createCaptureJobsRequestSchema = z
  .object({
    boardId: z.string().uuid(),
    routes: z
      .array(
        z
          .object({
            routePath: routePathSchema,
            resolvedPath: routePathSchema,
            scenario: z.string().trim().min(1).max(120).default("default"),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    viewportNames: z.array(z.string().trim().min(1).max(80)).min(1).max(8),
    createdBy: z.string().min(1).max(255),
  })
  .strict();

export const captureJobActionRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), jobId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("retry"), jobId: z.string().uuid() }).strict(),
  z.object({ action: z.literal("rerun"), jobId: z.string().uuid() }).strict(),
]);

export const captureConfigResponseSchema = z.object({
  config: captureConfigSchema.nullable(),
});

export const captureJobsResponseSchema = z.object({
  jobs: z.array(captureJobSchema),
});

export const captureJobResponseSchema = z.object({
  job: captureJobSchema,
  deduplicated: z.boolean().default(false),
});

export const defaultCaptureOptions = captureOptionsSchema.parse({});
export const defaultCaptureViewports = [
  captureViewportSchema.parse({ name: "Desktop", width: 1440, height: 900 }),
];

export type CaptureOptions = z.infer<typeof captureOptionsSchema>;
export type CaptureViewport = z.infer<typeof captureViewportSchema>;
export type LoginSetupStep = z.infer<typeof loginSetupStepSchema>;
export type CaptureConfig = z.infer<typeof captureConfigSchema>;
export type CaptureAuthConfig = z.infer<typeof captureAuthConfigSchema>;
export type CaptureConfigInput = z.infer<typeof captureConfigInputSchema>;
export type CaptureTargetResult = z.infer<typeof captureTargetResultSchema>;
export type CaptureJob = z.infer<typeof captureJobSchema>;
export type CreateCaptureJobsRequest = z.infer<typeof createCaptureJobsRequestSchema>;
