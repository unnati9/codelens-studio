"use client";

import { useEffect, useMemo, useState } from "react";
import { analyzeBoardAffectedRoutes, saveRepositoryRouteConfig } from "@/lib/data/affected-routes";
import type {
  AffectedRouteAnalysisResponse,
  RepositoryRouteConfig,
  RepositoryRouteConfigInput,
} from "@/lib/affected-routes/schema";
import type { Board } from "@/lib/validation/board";

type AffectedUiPanelProps = {
  board: Board;
  createdBy: string;
  onClose: () => void;
};

const frameworkLabels = {
  NEXT_APP_ROUTER: "Next.js App Router",
  NEXT_PAGES_ROUTER: "Next.js Pages Router",
  REACT_ROUTER: "React Router",
  UNKNOWN: "Unknown",
} as const;

function mappingLines(config: RepositoryRouteConfig | null) {
  return (config?.route_mappings ?? [])
    .map((mapping) => `${mapping.routePath}=${mapping.sourceFiles.join(",")}`)
    .join("\n");
}

function exampleLines(config: RepositoryRouteConfig | null) {
  return (config?.dynamic_route_examples ?? [])
    .map((example) => `${example.routePath}=${example.examplePath}`)
    .join("\n");
}

function setupLines(config: RepositoryRouteConfig | null) {
  return (config?.routes_requiring_setup ?? [])
    .map((setup) => `${setup.routePath}=${setup.instructions}`)
    .join("\n");
}

function parseConfiguredLines(value: string, label: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf("=");
      if (separator <= 0) throw new Error(`${label} lines must use /route=value.`);
      const routePath = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim();
      if (!routePath.startsWith("/") || !value) {
        throw new Error(`${label} lines must use /route=value.`);
      }
      return { routePath, value };
    });
}

export function AffectedUiPanel({ board, createdBy, onClose }: AffectedUiPanelProps) {
  const [result, setResult] = useState<AffectedRouteAnalysisResponse | null>(null);
  const [busyLabel, setBusyLabel] = useState("Analyzing repository");
  const [error, setError] = useState<string | null>(null);
  const [routeMappingsText, setRouteMappingsText] = useState("");
  const [dynamicExamplesText, setDynamicExamplesText] = useState("");
  const [routeSetupText, setRouteSetupText] = useState("");
  const [manualRoute, setManualRoute] = useState("");
  const [manualSource, setManualSource] = useState("");

  function applyConfig(config: RepositoryRouteConfig | null) {
    setRouteMappingsText(mappingLines(config));
    setDynamicExamplesText(exampleLines(config));
    setRouteSetupText(setupLines(config));
  }

  async function runAnalysis(force: boolean) {
    setBusyLabel(force ? "Re-running analysis" : "Analyzing repository");
    setError(null);
    try {
      const nextResult = await analyzeBoardAffectedRoutes(board.id, force);
      setResult(nextResult);
      applyConfig(nextResult.config);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Affected-route analysis failed.",
      );
    } finally {
      setBusyLabel("");
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const nextResult = await analyzeBoardAffectedRoutes(board.id, false);
        if (cancelled) return;
        setResult(nextResult);
        applyConfig(nextResult.config);
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error ? caughtError.message : "Affected-route analysis failed.",
          );
        }
      } finally {
        if (!cancelled) setBusyLabel("");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [board.id]);

  function configInput(
    overrides: Partial<RepositoryRouteConfigInput> = {},
  ): RepositoryRouteConfigInput {
    const mappings = parseConfiguredLines(routeMappingsText, "Route mapping").map((entry) => ({
      routePath: entry.routePath,
      sourceFiles: entry.value
        .split(",")
        .map((path) => path.trim())
        .filter(Boolean),
    }));
    const examples = parseConfiguredLines(dynamicExamplesText, "Dynamic example").map((entry) => ({
      routePath: entry.routePath,
      examplePath: entry.value,
    }));
    const setup = parseConfiguredLines(routeSetupText, "Route setup").map((entry) => ({
      routePath: entry.routePath,
      instructions: entry.value,
    }));
    return {
      boardId: board.id,
      routeMappings: mappings,
      dynamicRouteExamples: examples,
      routesRequiringSetup: setup,
      ignoredRoutes: result?.config?.ignored_routes ?? [],
      createdBy,
      ...overrides,
    };
  }

  async function saveAndAnalyze(input: RepositoryRouteConfigInput, label: string) {
    setBusyLabel(label);
    setError(null);
    try {
      const saved = await saveRepositoryRouteConfig(input);
      applyConfig(saved.config);
      const nextResult = await analyzeBoardAffectedRoutes(board.id, true);
      setResult(nextResult);
      applyConfig(nextResult.config);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Could not save route configuration.",
      );
    } finally {
      setBusyLabel("");
    }
  }

  async function saveFallbacks() {
    try {
      await saveAndAnalyze(configInput(), "Saving fallbacks");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Invalid fallback configuration.",
      );
    }
  }

  async function addManualRoute() {
    const routePath = manualRoute.trim();
    if (!routePath.startsWith("/")) {
      setError("Manual routes must start with a slash.");
      return;
    }
    try {
      const current = configInput();
      const sourceFiles = manualSource
        .split(",")
        .map((path) => path.trim())
        .filter(Boolean);
      const routeMappings = [
        ...current.routeMappings.filter((mapping) => mapping.routePath !== routePath),
        { routePath, sourceFiles },
      ];
      await saveAndAnalyze({ ...current, routeMappings }, "Adding route");
      setManualRoute("");
      setManualSource("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not add the route.");
    }
  }

  async function setRouteRelevant(routePath: string, relevant: boolean) {
    try {
      const current = configInput();
      const ignoredRoutes = relevant
        ? current.ignoredRoutes.filter((path) => path !== routePath)
        : [...new Set([...current.ignoredRoutes, routePath])];
      await saveAndAnalyze(
        { ...current, ignoredRoutes },
        relevant ? "Restoring route" : "Marking route irrelevant",
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not update the route.");
    }
  }

  const activeRoutes = useMemo(
    () => result?.analysis.routes.filter((route) => !route.irrelevant) ?? [],
    [result],
  );
  const ignoredRoutes = useMemo(
    () => result?.analysis.routes.filter((route) => route.irrelevant) ?? [],
    [result],
  );

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[1960] bg-[#0d1929]/45"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busyLabel) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="affected-ui-title"
        data-testid="affected-ui-panel"
        className="ml-auto flex h-full w-full max-w-[580px] flex-col overflow-y-auto border-l border-[#d9d4ca] bg-[#fffdf8] shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between border-b border-[#e0dcd3] bg-[#fffdf8] px-5 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff5a36]">
              Route analysis
            </p>
            <h2 id="affected-ui-title" className="mt-1 text-lg font-black text-[#15263d]">
              Affected UI
            </h2>
            <p className="mt-1 text-xs text-[#74777d]">
              {board.github_owner}/{board.github_repository} · {board.github_head_sha?.slice(0, 10)}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close affected UI panel"
            disabled={Boolean(busyLabel)}
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xl text-[#6e7178] hover:bg-[#efede7] disabled:opacity-40"
          >
            ×
          </button>
        </header>

        <div className="space-y-5 p-5">
          <section className="rounded-xl border border-[#e0dcd3] bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wide text-[#777b82]">
                  Detected framework
                </p>
                <p className="mt-1 text-sm font-black text-[#15263d]">
                  {result ? frameworkLabels[result.analysis.framework] : "Waiting for analysis"}
                </p>
              </div>
              <button
                type="button"
                data-testid="rerun-affected-routes"
                disabled={Boolean(busyLabel)}
                onClick={() => void runAnalysis(true)}
                className="rounded-lg border border-[#d8d3c8] px-3 py-2 text-xs font-bold text-[#365a83] disabled:opacity-40"
              >
                Re-run analysis
              </button>
            </div>
            {result && (
              <p className="mt-3 text-[11px] text-[#777b82]">
                {activeRoutes.length} affected route{activeRoutes.length === 1 ? "" : "s"} ·{" "}
                {result.cacheHit ? "cached" : "fresh"} · {result.analysis.stats.filesAnalyzed} files
                analyzed
              </p>
            )}
          </section>

          {busyLabel && (
            <p role="status" className="rounded-lg bg-sky-50 p-3 text-xs font-bold text-sky-800">
              {busyLabel}…
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">
              {error}
            </p>
          )}
          {result?.analysis.broadImpact && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
              <strong>Broad-impact warning:</strong> {result.analysis.broadImpactFiles.join(", ")}{" "}
              can affect every detected UI route.
            </p>
          )}

          <section className="space-y-3">
            {activeRoutes.map((route) => (
              <article
                key={`${route.framework}:${route.routePath}`}
                className="rounded-xl border border-[#ded9cf] bg-white p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate font-mono text-sm font-black text-[#15263d]">
                      {route.routePath}
                    </h3>
                    <p className="mt-1 text-[11px] text-[#777b82]">
                      {route.confidence} confidence ({Math.round(route.confidenceScore * 100)}%) ·{" "}
                      {route.impact.toLowerCase()} impact · {route.capturePriority.toLowerCase()}{" "}
                      priority
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={Boolean(busyLabel)}
                    onClick={() => void setRouteRelevant(route.routePath, false)}
                    className="shrink-0 text-[11px] font-bold text-[#8a5a4e] disabled:opacity-40"
                  >
                    Mark irrelevant
                  </button>
                </div>
                <p className="mt-3 text-xs leading-5 text-[#4f5865]">{route.reason}</p>
                {route.dynamicRouteWarning && (
                  <p className="mt-2 rounded-md bg-violet-50 p-2 text-[11px] text-violet-800">
                    {route.dynamicRouteWarning}
                  </p>
                )}
                {route.requiresSetup && (
                  <p className="mt-2 rounded-md bg-orange-50 p-2 text-[11px] text-orange-800">
                    Setup: {route.setupInstructions}
                  </p>
                )}
                <details className="mt-3 text-[11px] text-[#626a75]">
                  <summary className="cursor-pointer font-bold">
                    Related files and import chain
                  </summary>
                  <p className="mt-2 break-all">
                    Changed: {route.relatedChangedFiles.join(", ") || "Manual route"}
                  </p>
                  <p className="mt-1 break-all">Chain: {route.importChain.join(" → ")}</p>
                </details>
              </article>
            ))}
            {!busyLabel && result && activeRoutes.length === 0 && (
              <p className="rounded-xl border border-dashed border-[#cfc9bd] p-5 text-center text-xs text-[#777b82]">
                No affected route was found within the configured limits. Add a repository fallback
                below.
              </p>
            )}
          </section>

          {ignoredRoutes.length > 0 && (
            <details className="rounded-xl border border-[#ded9cf] bg-[#f4f1eb] p-4">
              <summary className="cursor-pointer text-xs font-black text-[#4f5865]">
                Irrelevant routes ({ignoredRoutes.length})
              </summary>
              <div className="mt-3 space-y-2">
                {ignoredRoutes.map((route) => (
                  <div
                    key={route.routePath}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="truncate font-mono text-[#777b82]">{route.routePath}</span>
                    <button
                      type="button"
                      disabled={Boolean(busyLabel)}
                      onClick={() => void setRouteRelevant(route.routePath, true)}
                      className="font-bold text-[#365a83] disabled:opacity-40"
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}

          <section className="space-y-3 rounded-xl border border-[#e0dcd3] bg-[#f5f2ec] p-4">
            <h3 className="text-sm font-black text-[#15263d]">Add route manually</h3>
            <input
              value={manualRoute}
              onChange={(event) => setManualRoute(event.target.value)}
              placeholder="/account/[id]"
              className="w-full rounded-lg border border-[#d6d1c7] bg-white px-3 py-2 text-sm"
            />
            <input
              value={manualSource}
              onChange={(event) => setManualSource(event.target.value)}
              placeholder="Optional source files, comma-separated"
              className="w-full rounded-lg border border-[#d6d1c7] bg-white px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={Boolean(busyLabel) || !manualRoute.trim()}
              onClick={() => void addManualRoute()}
              className="rounded-lg bg-[#15263d] px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
            >
              Add route
            </button>
          </section>

          <details className="rounded-xl border border-[#e0dcd3] bg-white p-4">
            <summary className="cursor-pointer text-sm font-black text-[#15263d]">
              Repository fallbacks
            </summary>
            <div className="mt-4 space-y-4">
              <label className="block text-xs font-bold text-[#4d5663]">
                Route-to-source mappings
                <textarea
                  rows={4}
                  value={routeMappingsText}
                  onChange={(event) => setRouteMappingsText(event.target.value)}
                  placeholder="/account=src/pages/account.tsx"
                  className="mt-1.5 w-full rounded-lg border border-[#d6d1c7] px-3 py-2 font-mono text-xs"
                />
              </label>
              <label className="block text-xs font-bold text-[#4d5663]">
                Dynamic-route examples
                <textarea
                  rows={3}
                  value={dynamicExamplesText}
                  onChange={(event) => setDynamicExamplesText(event.target.value)}
                  placeholder="/products/[id]=/products/example"
                  className="mt-1.5 w-full rounded-lg border border-[#d6d1c7] px-3 py-2 font-mono text-xs"
                />
              </label>
              <label className="block text-xs font-bold text-[#4d5663]">
                Routes requiring setup
                <textarea
                  rows={3}
                  value={routeSetupText}
                  onChange={(event) => setRouteSetupText(event.target.value)}
                  placeholder="/checkout=Seed a cart before capture"
                  className="mt-1.5 w-full rounded-lg border border-[#d6d1c7] px-3 py-2 font-mono text-xs"
                />
              </label>
              <button
                type="button"
                disabled={Boolean(busyLabel)}
                onClick={() => void saveFallbacks()}
                className="rounded-lg bg-[#ff5a36] px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
              >
                Save fallbacks and analyze
              </button>
            </div>
          </details>

          {result?.analysis.warnings.length ? (
            <details className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
              <summary className="cursor-pointer font-bold">
                Analysis warnings ({result.analysis.warnings.length})
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {result.analysis.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
