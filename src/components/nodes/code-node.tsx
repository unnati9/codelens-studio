"use client";

import { NodeResizer, type NodeProps } from "@xyflow/react";
import { useMemo } from "react";
import { useBoardNodeActions } from "@/components/canvas/board-node-actions";
import type { BoardFlowNode } from "@/lib/nodes/serialization";

const languages = [
  ["typescript", "TypeScript"],
  ["javascript", "JavaScript"],
  ["css", "CSS"],
  ["html", "HTML"],
  ["json", "JSON"],
  ["text", "Plain text"],
] as const;

function diffLineClass(line: string) {
  if (line.startsWith("@@")) return "bg-sky-400/10 text-sky-200";
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "bg-emerald-400/10 text-emerald-200";
  }
  if (line.startsWith("-") && !line.startsWith("---")) return "bg-red-400/10 text-red-200";
  return "text-[#cbd7e4]";
}

export function CodeNode({ id, data, selected }: NodeProps<BoardFlowNode>) {
  const { beginNodeInteraction, updateNode, commitResize } = useBoardNodeActions();
  const record = data.record;
  const content = record.content;
  const lineNumbers = useMemo(
    () => (content.kind === "code" ? content.code.split("\n").map((_, index) => index + 1) : []),
    [content],
  );

  if (content.kind !== "code") return null;
  const source = content.source;
  const codeLines = content.code.split("\n");
  const stale = source?.isStale === true;

  return (
    <article
      data-testid="code-node"
      data-node-id={id}
      data-position-x={record.position_x}
      data-position-y={record.position_y}
      data-width={record.width}
      data-height={record.height}
      data-source-type={source?.sourceType}
      data-source-stale={stale || undefined}
      className={`flex h-full w-full flex-col overflow-hidden rounded-[18px] border bg-[#132238] text-white shadow-[0_18px_45px_rgba(21,38,61,0.22)] transition-opacity ${
        stale ? "border-amber-400/80 opacity-70" : "border-[#bdc6d2]"
      }`}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={300}
        minHeight={240}
        handleClassName="node-resize-handle"
        onResizeStart={() => beginNodeInteraction(id)}
        onResizeEnd={(_event, params) => commitResize(id, params)}
      />

      <div className="node-drag-handle flex cursor-grab items-center gap-3 border-b border-white/10 bg-[#192b43] px-4 py-3 active:cursor-grabbing">
        <span
          data-testid="node-drag-handle"
          className="grid h-7 w-7 place-items-center rounded-lg bg-[#ff5a36] font-mono text-xs font-black"
        >
          &lt;/&gt;
        </span>
        <input
          aria-label="Code node title"
          data-testid="code-node-title"
          value={record.title ?? ""}
          onChange={(event) => updateNode(id, { title: event.target.value })}
          className="nodrag min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-bold text-white placeholder:text-white/35 hover:border-white/10 focus:border-white/20 focus:bg-white/5"
          placeholder="Code review"
        />
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/35">Code</span>
      </div>

      <div className="nodrag flex items-center gap-2 border-b border-white/10 bg-[#101e31] px-4 py-2">
        {source ? (
          <a
            href={source.blobUrl ?? source.pullRequestUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="github-file-link"
            className="min-w-0 flex-1 truncate rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-xs text-[#d5e1ee] hover:text-white"
          >
            {content.filename} ↗
          </a>
        ) : (
          <input
            aria-label="Filename"
            data-testid="code-filename"
            value={content.filename}
            onChange={(event) =>
              updateNode(id, { content: { ...content, filename: event.target.value } })
            }
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-xs text-[#d5e1ee]"
          />
        )}
        {source ? (
          <span className="rounded-md border border-white/10 bg-[#192b43] px-2 py-1.5 text-xs text-[#d5e1ee]">
            {content.language}
          </span>
        ) : (
          <select
            aria-label="Language"
            data-testid="code-language"
            value={content.language}
            onChange={(event) =>
              updateNode(id, {
                content: {
                  ...content,
                  language: event.target.value as typeof content.language,
                },
              })
            }
            className="rounded-md border border-white/10 bg-[#192b43] px-2 py-1.5 text-xs text-[#d5e1ee]"
          >
            {languages.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
      </div>

      {source && (
        <div className="nodrag flex flex-wrap items-center gap-2 border-b border-white/10 bg-[#132238] px-4 py-2 text-[10px] font-bold uppercase tracking-wide">
          <span className="rounded bg-white/10 px-2 py-1 text-white/65">{source.fileStatus}</span>
          <span className="text-emerald-300">+{source.additions}</span>
          <span className="text-red-300">−{source.deletions}</span>
          <span className="text-white/45">
            {source.repository} #{source.pullRequestNumber}
          </span>
          {stale && (
            <span
              data-testid="stale-github-source"
              className="rounded bg-amber-300/20 px-2 py-1 text-amber-200"
              title="This node was imported from an older pull-request revision."
            >
              Stale revision
            </span>
          )}
          {!source.patchAvailable && (
            <span className="rounded bg-amber-300/15 px-2 py-1 text-amber-200">
              Diff unavailable
            </span>
          )}
        </div>
      )}

      {source ? (
        <div
          data-testid="imported-code-diff"
          data-source-key={source.sourceKey}
          className="nodrag nowheel min-h-0 flex-1 select-text overflow-auto bg-[#0f1c2d]"
          onWheel={(event) => event.stopPropagation()}
        >
          <table className="w-max min-w-full border-collapse font-mono text-xs leading-5">
            <tbody>
              {codeLines.map((line, index) => (
                <tr key={`${index}-${line.slice(0, 24)}`} className={diffLineClass(line)}>
                  <td className="sticky left-0 w-12 select-none border-r border-white/5 bg-[#0f1c2d] px-3 text-right align-top text-white/25">
                    {index + 1}
                  </td>
                  <td className="whitespace-pre px-3 pr-8 align-top">{line || " "}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="nodrag nowheel grid min-h-0 flex-1 grid-cols-[42px_1fr] overflow-hidden bg-[#0f1c2d]">
          <div
            aria-hidden="true"
            className="overflow-hidden border-r border-white/5 py-3 text-right font-mono text-xs leading-5 text-white/25"
          >
            {lineNumbers.map((line) => (
              <div key={line} className="pr-3">
                {line}
              </div>
            ))}
          </div>
          <textarea
            aria-label="Code"
            data-testid="code-editor"
            value={content.code}
            onChange={(event) =>
              updateNode(id, { content: { ...content, code: event.target.value } })
            }
            onWheel={(event) => event.stopPropagation()}
            spellCheck={false}
            className="h-full min-h-0 w-full resize-none overflow-auto bg-transparent p-3 font-mono text-xs leading-5 text-[#d7e2ef] outline-none"
          />
        </div>
      )}
    </article>
  );
}
