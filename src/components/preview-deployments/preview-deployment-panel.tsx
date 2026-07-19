"use client";

import { useEffect, useState } from "react";
import {
  getPreviewDeploymentConfiguration,
  refreshBoardPreviewDeployment,
  savePreviewDeploymentConfiguration,
  testPreviewDeploymentConnection,
} from "@/lib/data/preview-deployments";
import type { Board, PreviewDeploymentStatus } from "@/lib/validation/board";

type PreviewDeploymentPanelProps = {
  board: Board;
  createdBy: string;
  onBoardChange: (board: Board) => void;
  onClose: () => void;
};

const statusLabels: Record<PreviewDeploymentStatus, string> = {
  QUEUED: "Queued",
  BUILDING: "Building",
  READY: "Ready",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  NOT_FOUND: "Not found",
  ACCESS_REQUIRED: "Access required",
};

const statusClasses: Record<PreviewDeploymentStatus, string> = {
  QUEUED: "bg-amber-100 text-amber-800",
  BUILDING: "bg-sky-100 text-sky-800",
  READY: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-red-100 text-red-800",
  CANCELLED: "bg-slate-200 text-slate-700",
  NOT_FOUND: "bg-slate-100 text-slate-700",
  ACCESS_REQUIRED: "bg-orange-100 text-orange-800",
};

export function previewDeploymentStatusLabel(status: PreviewDeploymentStatus | null) {
  return status ? statusLabels[status] : "Not configured";
}

export function PreviewDeploymentPanel({
  board,
  createdBy,
  onBoardChange,
  onClose,
}: PreviewDeploymentPanelProps) {
  const [loading, setLoading] = useState(true);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [productionUrl, setProductionUrl] = useState("");
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await getPreviewDeploymentConfiguration(board.id);
        if (cancelled) return;
        setEnabled(result.config?.enabled ?? false);
        setProjectId(result.config?.vercel_project_id ?? "");
        setTeamId(result.config?.vercel_team_id ?? "");
        setProductionUrl(result.config?.production_url ?? "");
        setTokenConfigured(result.tokenConfigured);
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Could not load preview configuration.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [board.id]);

  async function testConnection() {
    setBusyLabel("Testing connection");
    setError(null);
    setNotice(null);
    try {
      const result = await testPreviewDeploymentConnection({
        vercelProjectId: projectId,
        vercelTeamId: teamId || null,
        productionUrl,
      });
      setNotice(`Connected to Vercel project ${result.projectName}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Vercel connection failed.");
    } finally {
      setBusyLabel(null);
    }
  }

  async function refreshDeployment() {
    setBusyLabel("Refreshing deployment");
    setError(null);
    setNotice(null);
    try {
      const result = await refreshBoardPreviewDeployment(board.id);
      onBoardChange(result.board);
      setNotice(`Deployment status: ${previewDeploymentStatusLabel(result.deployment.status)}.`);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Could not refresh the deployment.",
      );
    } finally {
      setBusyLabel(null);
    }
  }

  async function saveConfiguration() {
    setBusyLabel("Saving configuration");
    setError(null);
    setNotice(null);
    try {
      await savePreviewDeploymentConfiguration({
        boardId: board.id,
        provider: "VERCEL",
        vercelProjectId: projectId,
        vercelTeamId: teamId || null,
        productionUrl,
        enabled,
        createdBy,
      });
      const refreshed = await refreshBoardPreviewDeployment(board.id);
      onBoardChange(refreshed.board);
      setNotice(
        enabled
          ? `Configuration saved. Deployment status: ${previewDeploymentStatusLabel(refreshed.deployment.status)}.`
          : "Preview deployment discovery is disabled.",
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Could not save preview configuration.",
      );
    } finally {
      setBusyLabel(null);
    }
  }

  const status = board.preview_deployment_status;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[1950] bg-[#0d1929]/45"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busyLabel) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="preview-deployment-title"
        data-testid="preview-deployment-panel"
        className="ml-auto flex h-full w-full max-w-[500px] flex-col overflow-y-auto border-l border-[#d9d4ca] bg-[#fffdf8] shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-[#e0dcd3] px-5 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff5a36]">
              Preview provider
            </p>
            <h2 id="preview-deployment-title" className="mt-1 text-lg font-black text-[#15263d]">
              Vercel deployment
            </h2>
            <p className="mt-1 text-xs text-[#74777d]">
              {board.github_owner}/{board.github_repository} · {board.github_head_branch}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close preview deployment panel"
            disabled={Boolean(busyLabel)}
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xl text-[#6e7178] hover:bg-[#efede7] disabled:opacity-40"
          >
            ×
          </button>
        </header>

        {loading ? (
          <div className="grid flex-1 place-items-center p-8 text-sm font-bold text-[#59616d]">
            Loading preview configuration…
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <section className="rounded-xl border border-[#e0dcd3] bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-black text-[#15263d]">Current deployment</h3>
                {status && (
                  <span
                    data-testid="preview-deployment-status"
                    className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusClasses[status]}`}
                  >
                    {statusLabels[status]}
                  </span>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-xs">
                <dt className="font-bold text-[#777b82]">Provider</dt>
                <dd className="text-[#26364d]">{board.preview_provider ?? "Vercel"}</dd>
                <dt className="font-bold text-[#777b82]">Commit</dt>
                <dd className="truncate font-mono text-[#26364d]">
                  {board.preview_commit_sha?.slice(0, 12) ?? "—"}
                </dd>
                <dt className="font-bold text-[#777b82]">Deployment ID</dt>
                <dd className="truncate font-mono text-[#26364d]">
                  {board.preview_deployment_id ?? "—"}
                </dd>
                <dt className="font-bold text-[#777b82]">Last checked</dt>
                <dd className="text-[#26364d]">
                  {board.preview_last_checked_at
                    ? new Date(board.preview_last_checked_at).toLocaleString()
                    : "Never"}
                </dd>
              </dl>
              {board.preview_failure_reason && (
                <p className="mt-3 rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                  {board.preview_failure_reason}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {board.preview_base_url && (
                  <a
                    href={board.preview_base_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-[#d8d3c8] px-3 py-2 text-xs font-bold text-[#365a83]"
                  >
                    Open base deployment ↗
                  </a>
                )}
                {board.preview_url && (
                  <a
                    href={board.preview_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-[#15263d] px-3 py-2 text-xs font-bold text-white"
                  >
                    Open PR preview ↗
                  </a>
                )}
                <button
                  type="button"
                  data-testid="refresh-preview-deployment"
                  disabled={Boolean(busyLabel)}
                  onClick={() => void refreshDeployment()}
                  className="rounded-lg border border-[#d8d3c8] px-3 py-2 text-xs font-bold text-[#4d5663] disabled:opacity-40"
                >
                  Refresh deployment
                </button>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-[#e0dcd3] bg-[#f5f2ec] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-[#15263d]">Repository configuration</h3>
                  <p className="mt-1 text-[11px] leading-5 text-[#777b82]">
                    Reused by all linked boards for this GitHub repository.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs font-bold text-[#4d5663]">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(event) => setEnabled(event.target.checked)}
                  />
                  Enabled
                </label>
              </div>
              <label className="block text-xs font-bold text-[#4d5663]">
                Vercel project ID
                <input
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  placeholder="prj_…"
                  className="mt-1.5 w-full rounded-lg border border-[#d6d1c7] bg-white px-3 py-2 text-sm text-[#253348]"
                />
              </label>
              <label className="block text-xs font-bold text-[#4d5663]">
                Vercel team ID (optional)
                <input
                  value={teamId}
                  onChange={(event) => setTeamId(event.target.value)}
                  placeholder="team_…"
                  className="mt-1.5 w-full rounded-lg border border-[#d6d1c7] bg-white px-3 py-2 text-sm text-[#253348]"
                />
              </label>
              <label className="block text-xs font-bold text-[#4d5663]">
                Production URL
                <input
                  type="url"
                  value={productionUrl}
                  onChange={(event) => setProductionUrl(event.target.value)}
                  placeholder="https://example.com"
                  className="mt-1.5 w-full rounded-lg border border-[#d6d1c7] bg-white px-3 py-2 text-sm text-[#253348]"
                />
              </label>
              {!tokenConfigured && (
                <p className="rounded-lg bg-orange-50 p-3 text-xs leading-5 text-orange-800">
                  `VERCEL_TOKEN` is not configured on the server. Connection tests and discovery
                  will report Access required.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="test-vercel-connection"
                  disabled={Boolean(busyLabel) || !projectId || !productionUrl}
                  onClick={() => void testConnection()}
                  className="rounded-lg border border-[#cfc9bd] bg-white px-3 py-2 text-xs font-bold text-[#365a83] disabled:opacity-40"
                >
                  Test connection
                </button>
                <button
                  type="button"
                  data-testid="save-preview-configuration"
                  disabled={Boolean(busyLabel)}
                  onClick={() => void saveConfiguration()}
                  className="rounded-lg bg-[#ff5a36] px-3 py-2 text-xs font-bold text-white disabled:opacity-40"
                >
                  {busyLabel ?? "Save configuration"}
                </button>
              </div>
            </section>

            {notice && (
              <p role="status" className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
                {notice}
              </p>
            )}
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">
                {error}
              </p>
            )}
            <p className="text-xs leading-5 text-[#777b82]">
              CodeLens does not bypass Vercel Deployment Protection. If discovery or access fails,
              manual screenshot upload remains available from the existing Image tool.
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
