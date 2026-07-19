import { z } from "zod";

const repositoryPathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (path) =>
      !path.startsWith("/") &&
      !path.split("/").some((segment) => segment === "" || segment === "." || segment === ".."),
    "Invalid repository path.",
  );

const routePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine((path) => path.startsWith("/"), "Route paths must start with a slash.");

export const affectedRouteFrameworkSchema = z.enum([
  "NEXT_APP_ROUTER",
  "NEXT_PAGES_ROUTER",
  "REACT_ROUTER",
  "UNKNOWN",
]);

export const affectedFileCategorySchema = z.enum([
  "ROUTE",
  "UI_COMPONENT",
  "STYLESHEET",
  "HOOK",
  "SHARED_LAYOUT",
  "GLOBAL_CSS",
  "TEST",
  "GENERATED",
  "BACKEND",
  "UNKNOWN",
]);

export const affectedRouteConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export const affectedRouteImpactSchema = z.enum(["DIRECT", "INDIRECT", "BROAD"]);
export const capturePrioritySchema = z.enum(["HIGH", "MEDIUM", "LOW"]);

export const routeSourceMappingSchema = z.object({
  routePath: routePathSchema,
  sourceFiles: z.array(repositoryPathSchema).max(50),
});

export const dynamicRouteExampleSchema = z.object({
  routePath: routePathSchema,
  examplePath: routePathSchema,
});

export const routeSetupRequirementSchema = z.object({
  routePath: routePathSchema,
  instructions: z.string().trim().min(1).max(2000),
});

export const repositoryRouteConfigSchema = z.object({
  id: z.string().uuid(),
  github_owner: z.string().min(1).max(120),
  github_repository: z.string().min(1).max(240),
  route_mappings: z.array(routeSourceMappingSchema).max(200),
  dynamic_route_examples: z.array(dynamicRouteExampleSchema).max(200),
  routes_requiring_setup: z.array(routeSetupRequirementSchema).max(200),
  ignored_routes: z.array(routePathSchema).max(500),
  created_by: z.string().min(1).max(255),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export const repositoryRouteConfigInputSchema = z
  .object({
    boardId: z.string().uuid(),
    routeMappings: z.array(routeSourceMappingSchema).max(200),
    dynamicRouteExamples: z.array(dynamicRouteExampleSchema).max(200),
    routesRequiringSetup: z.array(routeSetupRequirementSchema).max(200),
    ignoredRoutes: z.array(routePathSchema).max(500),
    createdBy: z.string().min(1).max(255),
  })
  .strict();

export const affectedRouteSchema = z.object({
  routePath: routePathSchema,
  framework: affectedRouteFrameworkSchema,
  confidence: affectedRouteConfidenceSchema,
  confidenceScore: z.number().min(0).max(1),
  impact: affectedRouteImpactSchema,
  relatedChangedFiles: z.array(repositoryPathSchema).max(300),
  importChain: z.array(z.string().min(1).max(1024)).max(30),
  sourceFiles: z.array(repositoryPathSchema).max(100),
  dynamicRouteWarning: z.string().max(2000).nullable(),
  examplePath: routePathSchema.nullable(),
  capturePriority: capturePrioritySchema,
  reason: z.string().min(1).max(3000),
  requiresSetup: z.boolean(),
  setupInstructions: z.string().max(2000).nullable(),
  manuallyConfigured: z.boolean(),
  irrelevant: z.boolean(),
});

export const affectedChangedFileSchema = z.object({
  path: repositoryPathSchema,
  category: affectedFileCategorySchema,
  analyzed: z.boolean(),
  reason: z.string().min(1).max(1000),
});

export const affectedRouteLimitsSchema = z.object({
  maxDepth: z.number().int().positive(),
  maxFiles: z.number().int().positive(),
  maxFileSizeBytes: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
});

export const affectedRouteAnalysisSchema = z.object({
  repository: z.string().min(3).max(240),
  headSha: z.string().regex(/^[a-f0-9]{7,64}$/i),
  framework: affectedRouteFrameworkSchema,
  routes: z.array(affectedRouteSchema).max(1000),
  changedFiles: z.array(affectedChangedFileSchema).max(3000),
  broadImpact: z.boolean(),
  broadImpactFiles: z.array(repositoryPathSchema).max(300),
  warnings: z.array(z.string().min(1).max(2000)).max(100),
  limits: affectedRouteLimitsSchema,
  stats: z.object({
    repositoryFilesSeen: z.number().int().nonnegative(),
    filesAnalyzed: z.number().int().nonnegative(),
    filesSkipped: z.number().int().nonnegative(),
    importsResolved: z.number().int().nonnegative(),
    routesDetected: z.number().int().nonnegative(),
    traversalTruncated: z.boolean(),
    timedOut: z.boolean(),
  }),
  analyzedAt: z.string().datetime({ offset: true }),
});

export const affectedRouteAnalysisRequestSchema = z
  .object({ boardId: z.string().uuid(), force: z.boolean().default(false) })
  .strict();

export const affectedRouteAnalysisResponseSchema = z.object({
  analysis: affectedRouteAnalysisSchema,
  config: repositoryRouteConfigSchema.nullable(),
  cacheHit: z.boolean(),
});

export const affectedRouteConfigQuerySchema = z.object({ boardId: z.string().uuid() }).strict();

export const affectedRouteConfigResponseSchema = z.object({
  config: repositoryRouteConfigSchema.nullable(),
});

export const repositorySourceFileSchema = z.object({
  path: repositoryPathSchema,
  content: z.string(),
  sizeBytes: z.number().int().nonnegative(),
});

export const repositorySourceSnapshotSchema = z.object({
  repository: z.string().min(3).max(240),
  headSha: z.string().regex(/^[a-f0-9]{7,64}$/i),
  files: z.array(repositorySourceFileSchema),
  repositoryFilesSeen: z.number().int().nonnegative(),
  filesSkipped: z.number().int().nonnegative(),
  treeTruncated: z.boolean(),
  timedOut: z.boolean(),
  warnings: z.array(z.string().min(1).max(2000)),
});

export type AffectedRouteFramework = z.infer<typeof affectedRouteFrameworkSchema>;
export type AffectedFileCategory = z.infer<typeof affectedFileCategorySchema>;
export type AffectedRoute = z.infer<typeof affectedRouteSchema>;
export type AffectedRouteAnalysis = z.infer<typeof affectedRouteAnalysisSchema>;
export type AffectedRouteAnalysisResponse = z.infer<typeof affectedRouteAnalysisResponseSchema>;
export type RepositoryRouteConfig = z.infer<typeof repositoryRouteConfigSchema>;
export type RepositoryRouteConfigInput = z.infer<typeof repositoryRouteConfigInputSchema>;
export type RepositorySourceFile = z.infer<typeof repositorySourceFileSchema>;
export type RepositorySourceSnapshot = z.infer<typeof repositorySourceSnapshotSchema>;
