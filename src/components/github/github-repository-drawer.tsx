"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { githubAuthStatusResponseSchema } from "@/lib/github/auth/schema";
import {
  githubConnectedPullRequestApiResponseSchema,
  githubPullRequestsApiResponseSchema,
  githubRepositoriesApiResponseSchema,
  type GitHubConnectedPullRequestRequest,
  type GitHubPullRequestSummary,
  type GitHubRepository,
} from "@/lib/github/connected-schema";
import { createGitHubSourceKey, isDefaultGitHubFileSelected } from "@/lib/github/import";
import {
  githubImportErrorResponseSchema,
  type GitHubChangedFile,
  type GitHubPullRequest,
} from "@/lib/github/schema";
import type { GitHubBoardSyncResponse } from "@/lib/github/board-sync-schema";
import type { Board, BoardNodeRecord } from "@/lib/validation/board";
import type { GitHubImportResult } from "./github-pr-import-dialog";

type GitHubRepositoryDrawerProps = {
  board: Board;
  existingNodes: BoardNodeRecord[];
  onClose: () => void;
  onUsePublicImport: () => void;
  onSync: (selection?: GitHubConnectedPullRequestRequest) => Promise<GitHubBoardSyncResponse>;
  onImport: (
    pullRequest: GitHubPullRequest,
    selectedFiles: GitHubChangedFile[],
  ) => Promise<GitHubImportResult>;
};

async function responseError(response: Response, fallback: string) {
  const body: unknown = await response.json().catch(() => null);
  const parsed = githubImportErrorResponseSchema.safeParse(body);
  return new Error(parsed.success ? parsed.data.error.message : fallback);
}

function repositoryKey(repository: GitHubRepository) {
  return `${repository.installationId}:${repository.repositoryId}`;
}

function locatorFor(
  repository: GitHubRepository,
  pullNumber: number,
): GitHubConnectedPullRequestRequest {
  return {
    installationId: repository.installationId,
    repositoryId: repository.repositoryId,
    owner: repository.owner,
    repository: repository.name,
    pullNumber,
  };
}

export function GitHubRepositoryDrawer({
  board,
  existingNodes,
  onClose,
  onUsePublicImport,
  onSync,
  onImport,
}: GitHubRepositoryDrawerProps) {
  const [connectionLoading, setConnectionLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [githubUser, setGitHubUser] = useState<string | null>(null);
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [selectedRepositoryKey, setSelectedRepositoryKey] = useState("");
  const [pullRequests, setPullRequests] = useState<GitHubPullRequestSummary[]>([]);
  const [selectedPullNumber, setSelectedPullNumber] = useState("");
  const [pullRequest, setPullRequest] = useState<GitHubPullRequest | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedRepository =
    repositories.find((repository) => repositoryKey(repository) === selectedRepositoryKey) ?? null;
  const existingSourceKeys = useMemo(
    () =>
      new Set(
        existingNodes.flatMap((node) =>
          node.content.kind === "code" && node.content.source
            ? [node.content.source.sourceKey]
            : [],
        ),
      ),
    [existingNodes],
  );

  const linkedToPreview = Boolean(
    pullRequest &&
    board.source_type === "GITHUB_PR" &&
    board.github_owner?.toLowerCase() ===
      pullRequest.repositoryFullName.split("/")[0]?.toLowerCase() &&
    board.github_repository?.toLowerCase() ===
      pullRequest.repositoryFullName.split("/")[1]?.toLowerCase() &&
    board.github_pull_request_number === pullRequest.pullNumber,
  );

  const initializeSelectedFiles = useCallback(
    (nextPullRequest: GitHubPullRequest) => {
      setSelectedFiles(
        new Set(
          nextPullRequest.files
            .filter((file) => {
              const sourceKey = createGitHubSourceKey({
                boardId: board.id,
                repository: nextPullRequest.repositoryFullName,
                pullRequestNumber: nextPullRequest.pullNumber,
                headCommitSha: nextPullRequest.headCommitSha,
                filename: file.filename,
              });
              return isDefaultGitHubFileSelected(file) && !existingSourceKeys.has(sourceKey);
            })
            .slice(0, nextPullRequest.importLimit)
            .map((file) => file.filename),
        ),
      );
    },
    [board.id, existingSourceKeys],
  );

  const loadRepositories = useCallback(async () => {
    setBusyLabel("Loading repositories");
    setError(null);
    try {
      const response = await fetch("/api/github/repositories", { cache: "no-store" });
      if (!response.ok) throw await responseError(response, "Could not load GitHub repositories.");
      const parsed = githubRepositoriesApiResponseSchema.parse(await response.json());
      setRepositories(parsed.repositories);
      const linkedFullName =
        board.github_owner && board.github_repository
          ? `${board.github_owner}/${board.github_repository}`.toLowerCase()
          : null;
      const initialRepository =
        parsed.repositories.find(
          (repository) => repository.fullName.toLowerCase() === linkedFullName,
        ) ??
        parsed.repositories.find((repository) => !repository.isPrivate && !repository.isArchived);
      setSelectedRepositoryKey(initialRepository ? repositoryKey(initialRepository) : "");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not load repositories.");
    } finally {
      setBusyLabel(null);
    }
  }, [board.github_owner, board.github_repository]);

  useEffect(() => {
    let cancelled = false;
    async function loadConnection() {
      setConnectionLoading(true);
      try {
        const response = await fetch("/api/github/auth/session", { cache: "no-store" });
        if (!response.ok) throw await responseError(response, "GitHub connection is unavailable.");
        const status = githubAuthStatusResponseSchema.parse(await response.json());
        if (cancelled) return;
        setConnected(status.connected);
        setGitHubUser(status.user?.login ?? null);
        setInstallUrl(status.installUrl);
        if (status.connected) await loadRepositories();
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "GitHub connection is unavailable.",
          );
        }
      } finally {
        if (!cancelled) setConnectionLoading(false);
      }
    }
    void loadConnection();
    return () => {
      cancelled = true;
    };
  }, [loadRepositories]);

  useEffect(() => {
    if (!selectedRepository) return;
    const repository = selectedRepository;
    let cancelled = false;
    async function loadPullRequests() {
      setBusyLabel("Loading open pull requests");
      setError(null);
      setNotice(null);
      setPullRequest(null);
      try {
        const response = await fetch("/api/github/pull-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            installationId: repository.installationId,
            repositoryId: repository.repositoryId,
            owner: repository.owner,
            repository: repository.name,
          }),
        });
        if (!response.ok) throw await responseError(response, "Could not load pull requests.");
        const parsed = githubPullRequestsApiResponseSchema.parse(await response.json());
        if (cancelled) return;
        setPullRequests(parsed.pullRequests);
        const linkedPull =
          board.github_owner?.toLowerCase() === repository.owner.toLowerCase() &&
          board.github_repository?.toLowerCase() === repository.name.toLowerCase()
            ? board.github_pull_request_number
            : null;
        const initialPull =
          parsed.pullRequests.find((candidate) => candidate.pullNumber === linkedPull) ??
          parsed.pullRequests[0];
        setSelectedPullNumber(initialPull ? String(initialPull.pullNumber) : "");
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error ? caughtError.message : "Could not load pull requests.",
          );
        }
      } finally {
        if (!cancelled) setBusyLabel(null);
      }
    }
    void loadPullRequests();
    return () => {
      cancelled = true;
    };
  }, [
    board.github_owner,
    board.github_pull_request_number,
    board.github_repository,
    selectedRepository,
  ]);

  useEffect(() => {
    if (!selectedRepository || !selectedPullNumber) return;
    const repository = selectedRepository;
    const pullNumber = Number(selectedPullNumber);
    let cancelled = false;
    async function loadPullRequest() {
      setBusyLabel("Loading changed files");
      setError(null);
      try {
        const response = await fetch("/api/github/pull-request/connected", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(locatorFor(repository, pullNumber)),
        });
        if (!response.ok) throw await responseError(response, "Could not load changed files.");
        const parsed = githubConnectedPullRequestApiResponseSchema.parse(await response.json());
        if (cancelled) return;
        setPullRequest(parsed.pullRequest);
        initializeSelectedFiles(parsed.pullRequest);
      } catch (caughtError) {
        if (!cancelled) {
          setError(
            caughtError instanceof Error ? caughtError.message : "Could not load changed files.",
          );
        }
      } finally {
        if (!cancelled) setBusyLabel(null);
      }
    }
    void loadPullRequest();
    return () => {
      cancelled = true;
    };
  }, [initializeSelectedFiles, selectedPullNumber, selectedRepository]);

  const syncPullRequest = async () => {
    if (!selectedRepository || !pullRequest) return;
    setBusyLabel(linkedToPreview ? "Syncing pull request" : "Linking pull request");
    setError(null);
    setNotice(null);
    try {
      const result = await onSync(locatorFor(selectedRepository, pullRequest.pullNumber));
      setPullRequest(result.pullRequest);
      initializeSelectedFiles(result.pullRequest);
      setNotice(
        result.headChanged
          ? `New head revision detected. Marked ${result.staleNodes.length} imported node${result.staleNodes.length === 1 ? "" : "s"} stale.`
          : linkedToPreview
            ? "Pull request is up to date."
            : "This board is now linked to the pull request.",
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Could not sync this pull request.",
      );
    } finally {
      setBusyLabel(null);
    }
  };

  const importSelectedFiles = async () => {
    if (!pullRequest || !linkedToPreview) return;
    const files = pullRequest.files.filter((file) => selectedFiles.has(file.filename));
    if (files.length === 0 || files.length > pullRequest.importLimit) return;
    setBusyLabel("Adding code nodes");
    setError(null);
    setNotice(null);
    try {
      const result = await onImport(pullRequest, files);
      setNotice(
        `Added ${result.importedCount} code node${result.importedCount === 1 ? "" : "s"}.${
          result.skippedCount
            ? ` Skipped ${result.skippedCount} existing file${result.skippedCount === 1 ? "" : "s"}.`
            : ""
        }`,
      );
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not add code nodes.");
    } finally {
      setBusyLabel(null);
    }
  };

  const disconnect = async () => {
    setBusyLabel("Disconnecting GitHub");
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/github/auth/disconnect", { method: "POST" });
      if (!response.ok) throw await responseError(response, "Could not disconnect GitHub.");
      setConnected(false);
      setGitHubUser(null);
      setRepositories([]);
      setPullRequest(null);
      setSelectedRepositoryKey("");
      setSelectedPullNumber("");
      setNotice("GitHub was disconnected from this browser.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not disconnect GitHub.");
    } finally {
      setBusyLabel(null);
    }
  };

  const selectedCount = selectedFiles.size;
  const overLimit = Boolean(pullRequest && selectedCount > pullRequest.importLimit);
  const returnTo = `/boards/${board.id}?drawer=github`;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[1900] bg-[#0d1929]/45"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busyLabel) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="github-drawer-title"
        data-testid="github-repository-drawer"
        className="ml-auto flex h-full w-full max-w-[560px] flex-col border-l border-[#d9d4ca] bg-[#fffdf8] shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-[#e0dcd3] px-5 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff5a36]">
              GitHub App
            </p>
            <h2 id="github-drawer-title" className="mt-1 text-lg font-black text-[#15263d]">
              Repository pull requests
            </h2>
            {githubUser && (
              <p className="mt-1 text-xs text-[#74777d]">Connected as @{githubUser}</p>
            )}
          </div>
          <button
            type="button"
            aria-label="Close GitHub drawer"
            disabled={Boolean(busyLabel)}
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xl text-[#6e7178] hover:bg-[#efede7] disabled:opacity-40"
          >
            ×
          </button>
        </header>

        {connectionLoading ? (
          <div className="grid flex-1 place-items-center p-8 text-sm font-bold text-[#59616d]">
            Checking GitHub connection…
          </div>
        ) : !connected ? (
          <div className="flex flex-1 flex-col justify-between p-6">
            <div>
              <h3 className="text-base font-black text-[#15263d]">
                Connect the CodeLens GitHub App
              </h3>
              <p className="mt-3 text-sm leading-6 text-[#6e7178]">
                Repository and token access stays on the server. CodeLens requests read-only
                pull-request access and never writes back to GitHub.
              </p>
              {error && (
                <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                  {error}
                </p>
              )}
              <a
                href={`/api/github/auth/start?returnTo=${encodeURIComponent(returnTo)}`}
                className="mt-6 inline-flex rounded-lg bg-[#15263d] px-4 py-2.5 text-sm font-bold text-white"
              >
                Connect GitHub
              </a>
            </div>
            <button
              type="button"
              onClick={onUsePublicImport}
              className="text-left text-xs font-bold text-[#365a83]"
            >
              Import a public PR URL without connecting →
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-4 border-b border-[#e4e0d7] bg-[#f5f2ec] px-5 py-4">
              <label className="block text-xs font-bold text-[#4d5663]">
                Repository
                <select
                  aria-label="GitHub repository"
                  value={selectedRepositoryKey}
                  onChange={(event) => {
                    setSelectedRepositoryKey(event.target.value);
                    setPullRequests([]);
                    setSelectedPullNumber("");
                    setPullRequest(null);
                  }}
                  disabled={Boolean(busyLabel)}
                  className="mt-1.5 w-full rounded-lg border border-[#d6d1c7] bg-white px-3 py-2 text-sm text-[#253348]"
                >
                  <option value="">Select a repository</option>
                  {repositories.map((repository) => (
                    <option
                      key={repositoryKey(repository)}
                      value={repositoryKey(repository)}
                      disabled={repository.isPrivate || repository.isArchived}
                    >
                      {repository.fullName}
                      {repository.isPrivate ? " · private (disabled)" : ""}
                      {repository.isArchived ? " · archived" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-bold text-[#4d5663]">
                Open pull request
                <select
                  aria-label="Open pull request"
                  value={selectedPullNumber}
                  onChange={(event) => {
                    setSelectedPullNumber(event.target.value);
                    setPullRequest(null);
                  }}
                  disabled={!selectedRepository || Boolean(busyLabel)}
                  className="mt-1.5 w-full rounded-lg border border-[#d6d1c7] bg-white px-3 py-2 text-sm text-[#253348]"
                >
                  <option value="">Select a pull request</option>
                  {pullRequests.map((candidate) => (
                    <option key={candidate.pullNumber} value={candidate.pullNumber}>
                      #{candidate.pullNumber} · {candidate.title}
                    </option>
                  ))}
                </select>
              </label>
              {repositories.length === 0 && (
                <p className="rounded-lg bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                  No installed repositories are available.{" "}
                  {installUrl && (
                    <a className="font-bold underline" href={installUrl}>
                      Configure the GitHub App installation.
                    </a>
                  )}
                </p>
              )}
              <p className="text-[11px] leading-5 text-[#777b82]">
                Private repositories are listed but disabled because this prototype currently stores
                board content under public guest RLS policies.
              </p>
            </div>

            {pullRequest ? (
              <>
                <div className="border-b border-[#e4e0d7] px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-[#ff5a36]">
                        {pullRequest.repositoryFullName} #{pullRequest.pullNumber}
                      </p>
                      <h3 className="mt-1 text-sm font-black text-[#15263d]">
                        {pullRequest.title}
                      </h3>
                      <p className="mt-1 text-xs text-[#70747b]">
                        @{pullRequest.authorLogin} · {pullRequest.baseBranch} ←{" "}
                        {pullRequest.headBranch}
                      </p>
                    </div>
                    <div className="shrink-0 text-right text-xs font-bold">
                      <p className="text-[#59616d]">{pullRequest.changedFileCount} files</p>
                      <p>
                        <span className="text-emerald-700">+{pullRequest.additions}</span>{" "}
                        <span className="text-red-700">−{pullRequest.deletions}</span>
                      </p>
                    </div>
                  </div>
                  {board.github_head_sha &&
                    board.github_head_sha !== pullRequest.headCommitSha &&
                    linkedToPreview && (
                      <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs font-bold text-amber-800">
                        A newer PR head revision is available.
                      </p>
                    )}
                  <button
                    type="button"
                    data-testid="sync-github-pr"
                    disabled={Boolean(busyLabel)}
                    onClick={() => void syncPullRequest()}
                    className="mt-3 rounded-lg bg-[#15263d] px-3.5 py-2 text-xs font-bold text-white disabled:opacity-40"
                  >
                    {linkedToPreview ? "Sync PR" : "Link this board to PR"}
                  </button>
                </div>

                <div className="flex items-center justify-between border-b border-[#e4e0d7] px-5 py-3 text-xs font-bold text-[#59616d]">
                  <span>
                    {selectedCount} selected · limit {pullRequest.importLimit}
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedFiles(new Set(pullRequest.files.map((file) => file.filename)))
                      }
                      className="text-[#365a83]"
                    >
                      Select all
                    </button>
                    <button type="button" onClick={() => setSelectedFiles(new Set())}>
                      Clear all
                    </button>
                  </span>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
                  <ul className="space-y-2">
                    {pullRequest.files.map((file) => {
                      const sourceKey = createGitHubSourceKey({
                        boardId: board.id,
                        repository: pullRequest.repositoryFullName,
                        pullRequestNumber: pullRequest.pullNumber,
                        headCommitSha: pullRequest.headCommitSha,
                        filename: file.filename,
                      });
                      const duplicate = existingSourceKeys.has(sourceKey);
                      return (
                        <li key={file.filename}>
                          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#e1ddd4] bg-white px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selectedFiles.has(file.filename)}
                              onChange={(event) => {
                                const next = new Set(selectedFiles);
                                if (event.target.checked) next.add(file.filename);
                                else next.delete(file.filename);
                                setSelectedFiles(next);
                              }}
                              className="mt-0.5 h-4 w-4 accent-[#ff5a36]"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-mono text-xs font-bold text-[#253348]">
                                {file.filename}
                              </span>
                              <span className="mt-1 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide text-[#86898f]">
                                <span>{file.status}</span>
                                <span className="text-emerald-700">+{file.additions}</span>
                                <span className="text-red-700">−{file.deletions}</span>
                                <span>{file.patch ? "Patch available" : "No patch"}</span>
                                {duplicate && (
                                  <span className="text-amber-700">Already imported · skip</span>
                                )}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </>
            ) : (
              <div className="grid flex-1 place-items-center p-8 text-center text-sm text-[#777b82]">
                {busyLabel ?? "Select an open pull request to inspect its changed files."}
              </div>
            )}

            <footer className="border-t border-[#e0dcd3] px-5 py-4">
              {error && (
                <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
                  {error}
                </p>
              )}
              {notice && (
                <p
                  role="status"
                  className="mb-3 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800"
                >
                  {notice}
                </p>
              )}
              {overLimit && (
                <p role="alert" className="mb-3 text-xs font-bold text-red-700">
                  Select no more than {pullRequest?.importLimit} files.
                </p>
              )}
              <div className="flex items-center justify-between gap-3">
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onUsePublicImport}
                    className="text-xs font-bold text-[#365a83]"
                  >
                    Public PR URL
                  </button>
                  <button
                    type="button"
                    onClick={() => void disconnect()}
                    disabled={Boolean(busyLabel)}
                    className="text-xs font-bold text-[#777b82]"
                  >
                    Disconnect
                  </button>
                </div>
                <button
                  type="button"
                  data-testid="add-selected-github-files"
                  disabled={
                    !linkedToPreview || selectedCount === 0 || overLimit || Boolean(busyLabel)
                  }
                  onClick={() => void importSelectedFiles()}
                  className="rounded-lg bg-[#ff5a36] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                >
                  {busyLabel ?? `Add ${selectedCount} code nodes`}
                </button>
              </div>
            </footer>
          </>
        )}
      </aside>
    </div>
  );
}
