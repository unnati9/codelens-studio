"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  defaultCaptureOptions,
  defaultCaptureViewports,
  loginSetupStepSchema,
  type CaptureConfig,
  type CaptureJob,
  type CaptureOptions,
  type CaptureViewport,
} from "@/lib/capture/schema";
import {
  getCaptureConfig,
  listCaptureJobs,
  mutateCaptureJob,
  queueCaptureJobs,
  saveCaptureConfig,
} from "@/lib/data/capture";
import type { AffectedRoute } from "@/lib/affected-routes/schema";
import type { Board } from "@/lib/validation/board";

type CapturePanelProps = {
  board: Board;
  routes: AffectedRoute[];
  createdBy: string;
};

function selectorsText(selectors: string[]) {
  return selectors.join("\n");
}

function parseSelectors(value: string) {
  return [
    ...new Set(
      value
        .split("\n")
        .map((selector) => selector.trim())
        .filter(Boolean),
    ),
  ];
}

function viewportsText(viewports: CaptureViewport[]) {
  return viewports
    .map(
      (viewport) =>
        `${viewport.name}=${viewport.width}x${viewport.height}@${viewport.deviceScaleFactor}${viewport.isMobile ? ",mobile" : ""}${viewport.hasTouch ? ",touch" : ""}`,
    )
    .join("\n");
}

function parseViewports(value: string): CaptureViewport[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^([^=]+)=(\d+)x(\d+)@([\d.]+)((?:,[a-z]+)*)$/i);
      if (!match) throw new Error("Viewport lines must use Name=1440x900@1[,mobile][,touch].");
      const flags = match[5].split(",").filter(Boolean);
      return {
        name: match[1].trim(),
        width: Number(match[2]),
        height: Number(match[3]),
        deviceScaleFactor: Number(match[4]),
        isMobile: flags.includes("mobile"),
        hasTouch: flags.includes("touch"),
      };
    });
}

function setupText(config: CaptureConfig | null) {
  return JSON.stringify(config?.login_setup ?? [], null, 2);
}

function statusStyle(status: CaptureJob["status"]) {
  if (status === "COMPLETED") return "bg-emerald-50 text-emerald-800";
  if (status === "FAILED") return "bg-red-50 text-red-800";
  if (status === "RUNNING") return "bg-sky-50 text-sky-800";
  if (status === "STALE") return "bg-amber-50 text-amber-800";
  return "bg-[#efede7] text-[#59616d]";
}

export function CapturePanel({ board, routes, createdBy }: CapturePanelProps) {
  const selectableRoutes = useMemo(
    () => routes.filter((route) => route.examplePath || !route.routePath.includes("[")),
    [routes],
  );
  const [options, setOptions] = useState<CaptureOptions>(defaultCaptureOptions);
  const [viewportsValue, setViewportsValue] = useState(viewportsText(defaultCaptureViewports));
  const [selectedViewportNames, setSelectedViewportNames] = useState<Set<string>>(
    new Set(defaultCaptureViewports.map((viewport) => viewport.name)),
  );
  const [storageStateEnvVar, setStorageStateEnvVar] = useState("");
  const [loginSetupValue, setLoginSetupValue] = useState("[]");
  const [maskSelectorsValue, setMaskSelectorsValue] = useState("");
  const [hideSelectorsValue, setHideSelectorsValue] = useState("");
  const [selectedRoutes, setSelectedRoutes] = useState<Set<string>>(
    () => new Set(selectableRoutes.map((route) => route.routePath)),
  );
  const [scenario, setScenario] = useState("default");
  const [jobs, setJobs] = useState<CaptureJob[]>([]);
  const [busy, setBusy] = useState<string | null>("Loading capture configuration");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const applyConfig = useCallback((nextConfig: CaptureConfig | null) => {
    const nextOptions = nextConfig?.capture_options ?? defaultCaptureOptions;
    const nextViewports = nextConfig?.viewports ?? defaultCaptureViewports;
    setOptions(nextOptions);
    setMaskSelectorsValue(selectorsText(nextOptions.maskSelectors));
    setHideSelectorsValue(selectorsText(nextOptions.hideSelectors));
    setViewportsValue(viewportsText(nextViewports));
    setSelectedViewportNames(new Set(nextViewports.map((viewport) => viewport.name)));
    setStorageStateEnvVar(nextConfig?.storage_state_env_var ?? "");
    setLoginSetupValue(setupText(nextConfig));
  }, []);

  const refreshJobs = useCallback(async () => {
    const result = await listCaptureJobs(board.id);
    setJobs(result.jobs);
  }, [board.id]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setBusy("Loading capture configuration");
      try {
        const [configResult, jobsResult] = await Promise.all([
          getCaptureConfig(board.id),
          listCaptureJobs(board.id),
        ]);
        if (cancelled) return;
        applyConfig(configResult.config);
        setJobs(jobsResult.jobs);
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error ? caughtError.message : "Could not load capture jobs.",
          );
        }
      } finally {
        if (!cancelled) setBusy(null);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [applyConfig, board.id]);

  useEffect(() => {
    if (!jobs.some((job) => job.status === "QUEUED" || job.status === "RUNNING")) return;
    const timer = window.setInterval(() => void refreshJobs().catch(() => undefined), 2000);
    return () => window.clearInterval(timer);
  }, [jobs, refreshJobs]);

  async function persistConfig() {
    const viewports = parseViewports(viewportsValue);
    const loginSetupValueParsed: unknown = JSON.parse(loginSetupValue);
    if (!Array.isArray(loginSetupValueParsed)) throw new Error("Login setup must be a JSON array.");
    const loginSetup = loginSetupValueParsed.map((step) => loginSetupStepSchema.parse(step));
    const result = await saveCaptureConfig({
      boardId: board.id,
      options: {
        ...options,
        maskSelectors: parseSelectors(maskSelectorsValue),
        hideSelectors: parseSelectors(hideSelectorsValue),
      },
      viewports,
      storageStateEnvVar: storageStateEnvVar.trim() || null,
      loginSetup,
      createdBy,
    });
    applyConfig(result.config);
    return result.config;
  }

  async function saveSettings() {
    setBusy("Saving capture settings");
    setError(null);
    setNotice(null);
    try {
      await persistConfig();
      setNotice("Repository capture settings saved.");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Could not save capture settings.",
      );
    } finally {
      setBusy(null);
    }
  }

  async function queueSelected() {
    setBusy("Queueing captures");
    setError(null);
    setNotice(null);
    try {
      const saved = await persistConfig();
      if (!saved) throw new Error("Capture configuration was not saved.");
      const selected = selectableRoutes.filter((route) => selectedRoutes.has(route.routePath));
      if (selected.length === 0) throw new Error("Select at least one capture-ready route.");
      const result = await queueCaptureJobs({
        boardId: board.id,
        routes: selected.map((route) => ({
          routePath: route.routePath,
          resolvedPath: route.examplePath ?? route.routePath,
          scenario: scenario.trim() || "default",
        })),
        viewportNames: saved.viewports
          .filter((viewport) => selectedViewportNames.has(viewport.name))
          .map((viewport) => viewport.name),
        createdBy,
      });
      await refreshJobs();
      setNotice(
        `Queued ${result.jobs.length - result.deduplicatedCount} capture job${result.jobs.length - result.deduplicatedCount === 1 ? "" : "s"}.${result.deduplicatedCount ? ` Reused ${result.deduplicatedCount} existing job(s).` : ""}`,
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not queue captures.");
    } finally {
      setBusy(null);
    }
  }

  async function runAction(action: "cancel" | "retry" | "rerun", jobId: string) {
    setBusy(`${action[0].toUpperCase()}${action.slice(1)}ing capture`);
    setError(null);
    try {
      await mutateCaptureJob(action, jobId);
      await refreshJobs();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Could not update capture job.",
      );
    } finally {
      setBusy(null);
    }
  }

  const configuredViewports = useMemo(() => {
    try {
      return parseViewports(viewportsValue);
    } catch {
      return [];
    }
  }, [viewportsValue]);

  return (
    <section className="space-y-4 rounded-xl border border-[#d8d3c8] bg-white p-4">
      <div>
        <p className="text-[10px] font-black uppercase tracking-wide text-[#ff5a36]">Playwright</p>
        <h3 className="mt-1 text-sm font-black text-[#15263d]">Automatic base and PR capture</h3>
        <p className="mt-1 text-[11px] leading-5 text-[#6e7178]">
          Each job creates base and PR full-page and viewport ImageNodes. Credentials are read only
          from worker environment variables.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-black text-[#4d5663]">Selected affected routes</p>
        {routes.map((route) => {
          const captureReady = route.examplePath || !route.routePath.includes("[");
          return (
            <label key={route.routePath} className="flex items-start gap-2 text-xs text-[#4f5865]">
              <input
                type="checkbox"
                checked={selectedRoutes.has(route.routePath)}
                disabled={!captureReady || Boolean(busy)}
                onChange={(event) => {
                  setSelectedRoutes((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(route.routePath);
                    else next.delete(route.routePath);
                    return next;
                  });
                }}
              />
              <span>
                <span className="font-mono font-bold">{route.routePath}</span>
                {route.examplePath && <span> → {route.examplePath}</span>}
                {!captureReady && (
                  <span className="block text-amber-700">Add a dynamic-route example first.</span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      <details className="rounded-lg border border-[#e0dcd3] p-3">
        <summary className="cursor-pointer text-xs font-black text-[#4d5663]">
          Deterministic capture settings
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-bold text-[#4d5663]">
            Locale
            <input
              value={options.locale}
              onChange={(event) => setOptions({ ...options, locale: event.target.value })}
              className="mt-1 w-full rounded border border-[#d6d1c7] px-2 py-1.5"
            />
          </label>
          <label className="text-xs font-bold text-[#4d5663]">
            Timezone
            <input
              value={options.timezoneId}
              onChange={(event) => setOptions({ ...options, timezoneId: event.target.value })}
              className="mt-1 w-full rounded border border-[#d6d1c7] px-2 py-1.5"
            />
          </label>
          <label className="text-xs font-bold text-[#4d5663]">
            Color scheme
            <select
              value={options.colorScheme}
              onChange={(event) =>
                setOptions({
                  ...options,
                  colorScheme: event.target.value as CaptureOptions["colorScheme"],
                })
              }
              className="mt-1 w-full rounded border border-[#d6d1c7] px-2 py-1.5"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="no-preference">No preference</option>
            </select>
          </label>
          <label className="text-xs font-bold text-[#4d5663]">
            Reduced motion
            <select
              value={options.reducedMotion}
              onChange={(event) =>
                setOptions({
                  ...options,
                  reducedMotion: event.target.value as CaptureOptions["reducedMotion"],
                })
              }
              className="mt-1 w-full rounded border border-[#d6d1c7] px-2 py-1.5"
            >
              <option value="reduce">Reduce</option>
              <option value="no-preference">No preference</option>
            </select>
          </label>
          <label className="text-xs font-bold text-[#4d5663]">
            Ready selector
            <input
              value={options.readySelector ?? ""}
              onChange={(event) =>
                setOptions({ ...options, readySelector: event.target.value || null })
              }
              placeholder="[data-ready=true]"
              className="mt-1 w-full rounded border border-[#d6d1c7] px-2 py-1.5"
            />
          </label>
          <label className="text-xs font-bold text-[#4d5663]">
            Delay after ready (ms)
            <input
              type="number"
              min={0}
              max={10000}
              value={options.delayAfterReadyMs}
              onChange={(event) =>
                setOptions({ ...options, delayAfterReadyMs: Number(event.target.value) })
              }
              className="mt-1 w-full rounded border border-[#d6d1c7] px-2 py-1.5"
            />
          </label>
          <label className="text-xs font-bold text-[#4d5663]">
            Capture timeout (ms)
            <input
              type="number"
              min={5000}
              max={120000}
              value={options.timeoutMs}
              onChange={(event) =>
                setOptions({ ...options, timeoutMs: Number(event.target.value) })
              }
              className="mt-1 w-full rounded border border-[#d6d1c7] px-2 py-1.5"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-[#4d5663]">
            <input
              type="checkbox"
              checked={options.disableAnimations}
              onChange={(event) =>
                setOptions({ ...options, disableAnimations: event.target.checked })
              }
            />{" "}
            Disable animations
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-[#4d5663]">
            <input
              type="checkbox"
              checked={options.waitForFonts}
              onChange={(event) => setOptions({ ...options, waitForFonts: event.target.checked })}
            />{" "}
            Wait for fonts
          </label>
          <label className="text-xs font-bold text-[#4d5663] sm:col-span-2">
            Mask selectors, one per line
            <textarea
              rows={2}
              value={maskSelectorsValue}
              onChange={(event) => setMaskSelectorsValue(event.target.value)}
              className="mt-1 w-full rounded border border-[#d6d1c7] px-2 py-1.5 font-mono"
            />
          </label>
          <label className="text-xs font-bold text-[#4d5663] sm:col-span-2">
            Hide selectors, one per line
            <textarea
              rows={2}
              value={hideSelectorsValue}
              onChange={(event) => setHideSelectorsValue(event.target.value)}
              className="mt-1 w-full rounded border border-[#d6d1c7] px-2 py-1.5 font-mono"
            />
          </label>
          <label className="text-xs font-bold text-[#4d5663] sm:col-span-2">
            Viewports
            <textarea
              rows={3}
              value={viewportsValue}
              onChange={(event) => setViewportsValue(event.target.value)}
              className="mt-1 w-full rounded border border-[#d6d1c7] px-2 py-1.5 font-mono"
            />
          </label>
          <label className="text-xs font-bold text-[#4d5663] sm:col-span-2">
            Storage-state environment variable
            <input
              value={storageStateEnvVar}
              onChange={(event) => setStorageStateEnvVar(event.target.value.toUpperCase())}
              placeholder="CODELENS_CAPTURE_STORAGE_STATE"
              className="mt-1 w-full rounded border border-[#d6d1c7] px-2 py-1.5 font-mono"
            />
          </label>
          <label className="text-xs font-bold text-[#4d5663] sm:col-span-2">
            Repository login setup (JSON; fill steps use valueEnv)
            <textarea
              rows={7}
              value={loginSetupValue}
              onChange={(event) => setLoginSetupValue(event.target.value)}
              className="mt-1 w-full rounded border border-[#d6d1c7] px-2 py-1.5 font-mono"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={Boolean(busy)}
          onClick={() => void saveSettings()}
          className="mt-3 rounded-lg border border-[#d8d3c8] px-3 py-2 text-xs font-bold text-[#365a83] disabled:opacity-40"
        >
          Save capture settings
        </button>
      </details>

      <div className="space-y-3 rounded-lg bg-[#f5f2ec] p-3">
        <label className="block text-xs font-bold text-[#4d5663]">
          Scenario
          <input
            value={scenario}
            onChange={(event) => setScenario(event.target.value)}
            className="mt-1 w-full rounded border border-[#d6d1c7] bg-white px-2 py-1.5"
          />
        </label>
        <div className="flex flex-wrap gap-3">
          {configuredViewports.map((viewport) => (
            <label
              key={viewport.name}
              className="flex items-center gap-2 text-xs font-bold text-[#4d5663]"
            >
              <input
                type="checkbox"
                checked={selectedViewportNames.has(viewport.name)}
                onChange={(event) =>
                  setSelectedViewportNames((current) => {
                    const next = new Set(current);
                    if (event.target.checked) next.add(viewport.name);
                    else next.delete(viewport.name);
                    return next;
                  })
                }
              />
              {viewport.name} ({viewport.width}×{viewport.height})
            </label>
          ))}
        </div>
        <button
          type="button"
          data-testid="queue-route-captures"
          disabled={
            Boolean(busy) ||
            selectedRoutes.size === 0 ||
            selectedViewportNames.size === 0 ||
            board.preview_deployment_status !== "READY"
          }
          onClick={() => void queueSelected()}
          className="rounded-lg bg-[#ff5a36] px-4 py-2 text-xs font-bold text-white disabled:opacity-40"
        >
          Queue selected captures
        </button>
        {board.preview_deployment_status !== "READY" && (
          <p className="text-[11px] text-amber-800">
            The base and PR preview deployments must both be ready.
          </p>
        )}
      </div>

      {busy && (
        <p role="status" className="rounded-lg bg-sky-50 p-2 text-xs font-bold text-sky-800">
          {busy}…
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
          {notice}
        </p>
      )}

      {jobs.length > 0 && (
        <details open className="rounded-lg border border-[#e0dcd3] p-3">
          <summary className="cursor-pointer text-xs font-black text-[#4d5663]">
            Capture jobs ({jobs.filter((job) => job.status !== "STALE").length} current)
          </summary>
          <div className="mt-3 space-y-2">
            {jobs.slice(0, 30).map((job) => (
              <article
                key={job.id}
                className="rounded-lg border border-[#ebe7de] p-3 text-[11px] text-[#59616d]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono font-bold">
                    {job.route_path} · {job.viewport.name} · {job.scenario}
                  </span>
                  <span className={`rounded px-2 py-0.5 font-black ${statusStyle(job.status)}`}>
                    {job.status}
                  </span>
                </div>
                <p className="mt-1">
                  Attempt {job.attempt}
                  {job.capture_duration_ms !== null ? ` · ${job.capture_duration_ms} ms` : ""}
                </p>
                {job.error_message && <p className="mt-1 text-red-700">{job.error_message}</p>}
                {job.base_result && job.pr_result && (
                  <div className="mt-2 space-y-1">
                    <p>
                      Base {job.base_result.httpStatus ?? "—"}:{" "}
                      <a
                        className="underline"
                        href={job.base_result.finalUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {job.base_result.finalUrl}
                      </a>
                    </p>
                    <p>
                      PR {job.pr_result.httpStatus ?? "—"}:{" "}
                      <a
                        className="underline"
                        href={job.pr_result.finalUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {job.pr_result.finalUrl}
                      </a>
                    </p>
                    <p>
                      Diagnostics:{" "}
                      {job.base_result.consoleErrors.length + job.pr_result.consoleErrors.length}{" "}
                      console ·{" "}
                      {job.base_result.pageErrors.length + job.pr_result.pageErrors.length} page ·{" "}
                      {job.base_result.failedRequests.length + job.pr_result.failedRequests.length}{" "}
                      network
                    </p>
                  </div>
                )}
                <div className="mt-2 flex gap-3">
                  {job.status === "QUEUED" && (
                    <button
                      type="button"
                      onClick={() => void runAction("cancel", job.id)}
                      className="font-bold text-[#8a5a4e]"
                    >
                      Cancel
                    </button>
                  )}
                  {job.status === "FAILED" && (
                    <button
                      type="button"
                      onClick={() => void runAction("retry", job.id)}
                      className="font-bold text-[#365a83]"
                    >
                      Retry
                    </button>
                  )}
                  {["COMPLETED", "FAILED", "CANCELLED"].includes(job.status) && (
                    <button
                      type="button"
                      onClick={() => void runAction("rerun", job.id)}
                      className="font-bold text-[#365a83]"
                    >
                      Re-run
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
