"use client";

import { useEffect, useMemo, useState } from "react";
import { createGitHubSourceKey, isDefaultGitHubFileSelected } from "@/lib/github/import";
import {
  githubImportErrorResponseSchema,
  githubPullRequestApiResponseSchema,
  type GitHubChangedFile,
  type GitHubPullRequest,
} from "@/lib/github/schema";
import type { BoardNodeRecord } from "@/lib/validation/board";

type DialogState = "URL_ENTRY" | "LOADING" | "PREVIEW" | "IMPORTING" | "SUCCESS" | "FAILURE";

export type GitHubImportResult = { importedCount: number; skippedCount: number };

type GitHubPrImportDialogProps = {
  boardId: string;
  existingNodes: BoardNodeRecord[];
  initialUrl?: string | null;
  onClose: () => void;
  onImport: (
    pullRequest: GitHubPullRequest,
    selectedFiles: GitHubChangedFile[],
  ) => Promise<GitHubImportResult>;
};

export function GitHubPrImportDialog({
  boardId,
  existingNodes,
  initialUrl,
  onClose,
  onImport,
}: GitHubPrImportDialogProps) {
  const [state, setState] = useState<DialogState>("URL_ENTRY");
  const [url, setUrl] = useState(initialUrl ?? "");
  const [pullRequest, setPullRequest] = useState<GitHubPullRequest | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GitHubImportResult | null>(null);

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

  const sourceKey = (file: GitHubChangedFile, pr: GitHubPullRequest) =>
    createGitHubSourceKey({
      boardId,
      repository: pr.repositoryFullName,
      pullRequestNumber: pr.pullNumber,
      headCommitSha: pr.headCommitSha,
      filename: file.filename,
    });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && state !== "LOADING" && state !== "IMPORTING") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, state]);

  const inspectPullRequest = async () => {
    if (!url.trim()) return;
    setState("LOADING");
    setError(null);
    try {
      const response = await fetch("/api/github/pull-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const failure = githubImportErrorResponseSchema.parse(body);
        throw new Error(failure.error.message);
      }
      const parsed = githubPullRequestApiResponseSchema.parse(body).pullRequest;
      setPullRequest(parsed);
      setSelected(
        new Set(
          parsed.files
            .filter(
              (file) =>
                isDefaultGitHubFileSelected(file) &&
                !existingSourceKeys.has(sourceKey(file, parsed)),
            )
            .slice(0, parsed.importLimit)
            .map((file) => file.filename),
        ),
      );
      setState("PREVIEW");
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : "Could not inspect this pull request.",
      );
      setState("FAILURE");
    }
  };

  const importFiles = async () => {
    if (!pullRequest) return;
    const selectedFiles = pullRequest.files.filter((file) => selected.has(file.filename));
    if (selectedFiles.length === 0 || selectedFiles.length > pullRequest.importLimit) return;
    setState("IMPORTING");
    setError(null);
    try {
      const importResult = await onImport(pullRequest, selectedFiles);
      setResult(importResult);
      setState("SUCCESS");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Could not import files.");
      setState("FAILURE");
    }
  };

  const selectedCount = selected.size;
  const overLimit = Boolean(pullRequest && selectedCount > pullRequest.importLimit);

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-[2000] grid place-items-center bg-[#0d1929]/65 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && state !== "LOADING" && state !== "IMPORTING") {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="github-import-title"
        data-testid="github-import-dialog"
        className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#d9d4ca] bg-[#fffdf8] shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-[#e0dcd3] px-5 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff5a36]">
              Read-only source
            </p>
            <h2 id="github-import-title" className="mt-1 text-lg font-black text-[#15263d]">
              Import GitHub pull request
            </h2>
          </div>
          <button
            type="button"
            aria-label="Close GitHub import"
            disabled={state === "LOADING" || state === "IMPORTING"}
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-xl text-[#6e7178] hover:bg-[#efede7] disabled:opacity-40"
          >
            ×
          </button>
        </header>

        {(state === "URL_ENTRY" || (state === "FAILURE" && !pullRequest)) && (
          <form
            className="p-6"
            onSubmit={(event) => {
              event.preventDefault();
              void inspectPullRequest();
            }}
          >
            <label htmlFor="github-pr-url" className="text-sm font-bold text-[#253348]">
              Public pull-request URL
            </label>
            <input
              id="github-pr-url"
              data-testid="github-pr-url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://github.com/owner/repository/pull/123"
              autoFocus
              className="mt-2 w-full rounded-xl border border-[#d6d1c7] bg-white px-4 py-3 text-sm text-[#253348] outline-none focus:border-[#ff5a36]"
            />
            <p className="mt-3 text-xs leading-5 text-[#777b82]">
              CodeLens Studio only reads public pull-request metadata and changed-file patches.
            </p>
            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[#d6d1c7] px-4 py-2 text-sm font-bold text-[#59616d]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!url.trim()}
                className="rounded-lg bg-[#15263d] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                Inspect pull request
              </button>
            </div>
          </form>
        )}

        {state === "LOADING" && (
          <div className="grid min-h-72 place-items-center p-8 text-center">
            <div>
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-[#15263d]/20 border-t-[#ff5a36]" />
              <p className="mt-4 text-sm font-bold text-[#253348]">Loading pull-request files…</p>
            </div>
          </div>
        )}

        {pullRequest && ["PREVIEW", "IMPORTING", "FAILURE"].includes(state) && (
          <>
            <div className="border-b border-[#e4e0d7] bg-[#f5f2ec] px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-black text-[#ff5a36]">
                    {pullRequest.repositoryFullName} #{pullRequest.pullNumber}
                  </p>
                  <h3 className="mt-1 truncate text-base font-black text-[#15263d]">
                    {pullRequest.title}
                  </h3>
                  <p className="mt-1 text-xs text-[#70747b]">
                    @{pullRequest.authorLogin} · {pullRequest.baseBranch} ← {pullRequest.headBranch}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <span className="rounded-lg bg-white px-3 py-2 font-bold text-[#555d68]">
                    {pullRequest.changedFileCount} files
                  </span>
                  <span className="rounded-lg bg-emerald-50 px-3 py-2 font-bold text-emerald-700">
                    +{pullRequest.additions}
                  </span>
                  <span className="rounded-lg bg-red-50 px-3 py-2 font-bold text-red-700">
                    −{pullRequest.deletions}
                  </span>
                </div>
              </div>
              {(pullRequest.unusuallyLarge || pullRequest.truncated) && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                  This is an unusually large pull request. Showing {pullRequest.files.length} of{" "}
                  {pullRequest.changedFileCount} files; import at most {pullRequest.importLimit} at
                  a time.
                </p>
              )}
            </div>

            <div className="flex items-center justify-between border-b border-[#e4e0d7] px-5 py-3">
              <p className="text-xs font-bold text-[#59616d]">
                {selectedCount} selected · limit {pullRequest.importLimit}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelected(new Set(pullRequest.files.map((file) => file.filename)))
                  }
                  className="text-xs font-bold text-[#365a83]"
                >
                  Select all
                </button>
                <span className="text-[#c5c1b8]">|</span>
                <button
                  type="button"
                  onClick={() => setSelected(new Set())}
                  className="text-xs font-bold text-[#59616d]"
                >
                  Clear all
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              <ul className="space-y-2">
                {pullRequest.files.map((file) => {
                  const duplicate = existingSourceKeys.has(sourceKey(file, pullRequest));
                  return (
                    <li key={file.filename}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#e1ddd4] bg-white px-3 py-3 hover:border-[#ffad99]">
                        <input
                          type="checkbox"
                          checked={selected.has(file.filename)}
                          onChange={(event) => {
                            const next = new Set(selected);
                            if (event.target.checked) next.add(file.filename);
                            else next.delete(file.filename);
                            setSelected(next);
                          }}
                          className="h-4 w-4 accent-[#ff5a36]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-mono text-xs font-bold text-[#253348]">
                            {file.filename}
                          </span>
                          {file.previousFilename && (
                            <span className="mt-1 block truncate font-mono text-[10px] text-[#85888e]">
                              renamed from {file.previousFilename}
                            </span>
                          )}
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

            <footer className="border-t border-[#e0dcd3] px-5 py-4">
              {overLimit && (
                <p role="alert" className="mb-3 text-xs font-bold text-red-700">
                  Select no more than {pullRequest.importLimit} files in one import.
                </p>
              )}
              {state === "FAILURE" && error && (
                <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">
                  {error}
                </p>
              )}
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  disabled={state === "IMPORTING"}
                  onClick={() => {
                    setPullRequest(null);
                    setState("URL_ENTRY");
                    setError(null);
                  }}
                  className="text-xs font-bold text-[#59616d] disabled:opacity-40"
                >
                  Use another URL
                </button>
                <button
                  type="button"
                  data-testid="import-selected-files"
                  disabled={selectedCount === 0 || overLimit || state === "IMPORTING"}
                  onClick={() => void importFiles()}
                  className="rounded-lg bg-[#15263d] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
                >
                  {state === "IMPORTING" ? "Importing…" : `Import ${selectedCount} files`}
                </button>
              </div>
            </footer>
          </>
        )}

        {state === "SUCCESS" && result && (
          <div className="grid min-h-72 place-items-center p-8 text-center">
            <div>
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-xl font-black text-emerald-700">
                ✓
              </div>
              <h3 className="mt-4 text-lg font-black text-[#15263d]">Import complete</h3>
              <p className="mt-2 text-sm text-[#6e7178]">
                Created {result.importedCount} code {result.importedCount === 1 ? "node" : "nodes"}.
                {result.skippedCount > 0 && ` Skipped ${result.skippedCount} existing files.`}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 rounded-lg bg-[#15263d] px-5 py-2.5 text-sm font-bold text-white"
              >
                View on canvas
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
