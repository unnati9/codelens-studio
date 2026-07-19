import { buildDependencyGraph } from "@/lib/affected-routes/imports";
import { classifyAffectedFile, isBroadImpactFile } from "@/lib/affected-routes/classification";
import {
  affectedRouteAnalysisSchema,
  type AffectedRoute,
  type AffectedRouteAnalysis,
  type RepositoryRouteConfig,
  type RepositorySourceSnapshot,
} from "@/lib/affected-routes/schema";
import {
  detectRoutes,
  dynamicRouteWarning,
  type DetectedRoute,
} from "@/lib/affected-routes/routes";

export type AffectedRouteAnalysisLimits = {
  maxDepth: number;
  maxFiles: number;
  maxFileSizeBytes: number;
  timeoutMs: number;
};

type RouteImpact = {
  changedFiles: Set<string>;
  chains: string[][];
  broadFiles: Set<string>;
};

function configuredInteger(name: string, fallback: number, maximum: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
}

export function affectedRouteAnalysisLimits(): AffectedRouteAnalysisLimits {
  return {
    maxDepth: configuredInteger("AFFECTED_ROUTE_MAX_DEPTH", 8, 20),
    maxFiles: configuredInteger("AFFECTED_ROUTE_MAX_FILES", 300, 1000),
    maxFileSizeBytes: configuredInteger("AFFECTED_ROUTE_MAX_FILE_SIZE_BYTES", 200_000, 500_000),
    timeoutMs: configuredInteger("AFFECTED_ROUTE_TIMEOUT_MS", 8_000, 12_000),
  };
}

function confidence(score: number): AffectedRoute["confidence"] {
  if (score >= 0.85) return "HIGH";
  if (score >= 0.65) return "MEDIUM";
  return "LOW";
}

function routeImpactReason(route: DetectedRoute, impact: RouteImpact, chain: string[]) {
  const broadFile = [...impact.broadFiles][0];
  if (broadFile) {
    return `${broadFile} is a broad-impact file that can change shared UI on ${route.routePath}.`;
  }
  if (route.manuallyConfigured && route.sourceFiles.length === 0) {
    return "The route was added manually as a repository fallback.";
  }
  if (chain.length <= 1) {
    return `${chain[0] ?? route.sourceFiles[0]} is the route component for ${route.routePath}.`;
  }
  return `${chain[0]} reaches ${route.routePath} through ${chain.length - 1} static import${chain.length === 2 ? "" : "s"}.`;
}

function dynamicMetadata(routePath: string, config: RepositoryRouteConfig | null) {
  const example = config?.dynamic_route_examples.find((entry) => entry.routePath === routePath);
  const warning = dynamicRouteWarning(routePath);
  return {
    examplePath: example?.examplePath ?? null,
    dynamicRouteWarning:
      warning && example ? `${warning} Configured example: ${example.examplePath}.` : warning,
  };
}

function routeSetup(routePath: string, config: RepositoryRouteConfig | null) {
  const setup = config?.routes_requiring_setup.find((entry) => entry.routePath === routePath);
  return {
    requiresSetup: Boolean(setup),
    setupInstructions: setup?.instructions ?? null,
  };
}

export function analyzeAffectedRoutes(input: {
  snapshot: RepositorySourceSnapshot;
  changedFiles: string[];
  config: RepositoryRouteConfig | null;
  limits?: AffectedRouteAnalysisLimits;
  now?: string;
}): AffectedRouteAnalysis {
  const limits = input.limits ?? affectedRouteAnalysisLimits();
  const startedAt = Date.now();
  const deadline = startedAt + limits.timeoutMs;
  const files = input.snapshot.files.slice(0, limits.maxFiles);
  const graph = buildDependencyGraph(files, deadline);
  const filePaths = new Set(graph.processedFiles.map((file) => file.path));
  const detection = detectRoutes(graph.processedFiles, graph.bindings, input.config);
  const routeImpacts = new Map<DetectedRoute, RouteImpact>();
  const routeSources = new Map<string, Set<DetectedRoute>>();
  let traversalTruncated = graph.timedOut;
  let timedOut = input.snapshot.timedOut || graph.timedOut;

  for (const route of detection.routes) {
    routeImpacts.set(route, { changedFiles: new Set(), chains: [], broadFiles: new Set() });
    for (const sourceFile of route.sourceFiles) {
      const sources = routeSources.get(sourceFile) ?? new Set<DetectedRoute>();
      sources.add(route);
      routeSources.set(sourceFile, sources);
    }
    if (route.manuallyConfigured && route.sourceFiles.length === 0) {
      const impact = routeImpacts.get(route)!;
      impact.chains.push([`manual:${route.routePath}`]);
    }
  }

  const changedFiles = [...new Set(input.changedFiles)];
  const classifiedChangedFiles = changedFiles.map((path) => {
    const classification = classifyAffectedFile(path);
    return {
      path,
      ...classification,
      analyzed:
        filePaths.has(path) && !["TEST", "GENERATED", "BACKEND"].includes(classification.category),
    };
  });
  const broadImpactFiles = classifiedChangedFiles
    .filter((file) => isBroadImpactFile(file.path, file.category))
    .map((file) => file.path);

  for (const broadFile of broadImpactFiles) {
    for (const route of detection.routes) {
      const impact = routeImpacts.get(route)!;
      impact.changedFiles.add(broadFile);
      impact.broadFiles.add(broadFile);
      impact.chains.push([broadFile, route.sourceFiles[0] ?? `route:${route.routePath}`]);
    }
  }

  for (const changedFile of classifiedChangedFiles) {
    if (Date.now() >= deadline) {
      timedOut = true;
      traversalTruncated = true;
      break;
    }
    if (["TEST", "GENERATED", "BACKEND"].includes(changedFile.category)) continue;
    const queue: Array<{ path: string; chain: string[]; depth: number }> = [
      { path: changedFile.path, chain: [changedFile.path], depth: 0 },
    ];
    const visited = new Set<string>();
    while (queue.length) {
      if (Date.now() >= deadline) {
        timedOut = true;
        traversalTruncated = true;
        break;
      }
      const current = queue.shift()!;
      if (visited.has(current.path)) continue;
      visited.add(current.path);
      for (const route of routeSources.get(current.path) ?? []) {
        const impact = routeImpacts.get(route)!;
        impact.changedFiles.add(changedFile.path);
        impact.chains.push(current.chain);
      }
      const importers = [...(graph.reverseImports.get(current.path) ?? [])];
      if (current.depth >= limits.maxDepth) {
        if (importers.length) traversalTruncated = true;
        continue;
      }
      importers.forEach((importer) =>
        queue.push({
          path: importer,
          chain: [...current.chain, importer],
          depth: current.depth + 1,
        }),
      );
    }
  }

  const ignoredRoutes = new Set(input.config?.ignored_routes ?? []);
  const routes = detection.routes.flatMap((route): AffectedRoute[] => {
    const impact = routeImpacts.get(route)!;
    if (!impact.chains.length) return [];
    const chain = [...impact.chains].sort((left, right) => left.length - right.length)[0];
    const isBroad = impact.broadFiles.size > 0;
    const impactType: AffectedRoute["impact"] = isBroad
      ? "BROAD"
      : chain.length <= 2
        ? "DIRECT"
        : "INDIRECT";
    const baseScore = isBroad
      ? 0.92
      : route.manuallyConfigured && route.sourceFiles.length === 0
        ? 0.7
        : impactType === "DIRECT"
          ? 0.94
          : Math.max(0.55, 0.86 - Math.max(0, chain.length - 2) * 0.07);
    const dynamic = dynamicMetadata(route.routePath, input.config);
    const setup = routeSetup(route.routePath, input.config);
    const irrelevant = ignoredRoutes.has(route.routePath);
    return [
      {
        routePath: route.routePath,
        framework: route.framework,
        confidence: confidence(baseScore),
        confidenceScore: baseScore,
        impact: impactType,
        relatedChangedFiles: [...impact.changedFiles].sort(),
        importChain: chain,
        sourceFiles: route.sourceFiles,
        ...dynamic,
        capturePriority: irrelevant
          ? "LOW"
          : isBroad || impactType === "DIRECT"
            ? "HIGH"
            : baseScore >= 0.65
              ? "MEDIUM"
              : "LOW",
        reason: routeImpactReason(route, impact, chain),
        ...setup,
        manuallyConfigured: route.manuallyConfigured,
        irrelevant,
      },
    ];
  });

  const warnings = [...input.snapshot.warnings];
  if (input.snapshot.files.length > limits.maxFiles) {
    warnings.push(`Analysis stopped after the configured ${limits.maxFiles}-file limit.`);
  }
  if (traversalTruncated) {
    warnings.push("Dependency traversal reached a configured depth, file, or time limit.");
  }
  if (broadImpactFiles.length) {
    warnings.push(
      `Broad-impact change detected: ${broadImpactFiles.join(", ")}. All detected UI routes are included.`,
    );
  }
  if (detection.framework === "UNKNOWN") {
    warnings.push("No supported route framework was detected. Add repository route mappings.");
  }

  return affectedRouteAnalysisSchema.parse({
    repository: input.snapshot.repository,
    headSha: input.snapshot.headSha,
    framework: detection.framework,
    routes: routes.sort((left, right) => {
      const priority = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
      return (
        priority[left.capturePriority] - priority[right.capturePriority] ||
        left.routePath.localeCompare(right.routePath)
      );
    }),
    changedFiles: classifiedChangedFiles,
    broadImpact: broadImpactFiles.length > 0,
    broadImpactFiles,
    warnings: [...new Set(warnings)],
    limits,
    stats: {
      repositoryFilesSeen: input.snapshot.repositoryFilesSeen,
      filesAnalyzed: graph.processedFiles.length,
      filesSkipped:
        input.snapshot.filesSkipped + Math.max(0, input.snapshot.files.length - files.length),
      importsResolved: graph.importsResolved,
      routesDetected: detection.routes.length,
      traversalTruncated,
      timedOut,
    },
    analyzedAt: input.now ?? new Date().toISOString(),
  });
}
