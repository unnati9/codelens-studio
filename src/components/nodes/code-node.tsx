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

export function CodeNode({ id, data, selected }: NodeProps<BoardFlowNode>) {
  const { updateNode, commitResize } = useBoardNodeActions();
  const record = data.record;
  const content = record.content;
  const lineNumbers = useMemo(
    () => (content.kind === "code" ? content.code.split("\n").map((_, index) => index + 1) : []),
    [content],
  );

  if (content.kind !== "code") return null;

  return (
    <article
      data-testid="code-node"
      data-node-id={id}
      data-position-x={record.position_x}
      data-position-y={record.position_y}
      data-width={record.width}
      data-height={record.height}
      className="flex h-full w-full flex-col overflow-hidden rounded-[18px] border border-[#bdc6d2] bg-[#132238] text-white shadow-[0_18px_45px_rgba(21,38,61,0.22)]"
    >
      <NodeResizer
        isVisible={selected}
        minWidth={300}
        minHeight={240}
        handleClassName="node-resize-handle"
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
        <input
          aria-label="Filename"
          data-testid="code-filename"
          value={content.filename}
          onChange={(event) =>
            updateNode(id, { content: { ...content, filename: event.target.value } })
          }
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-xs text-[#d5e1ee]"
        />
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
      </div>

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
    </article>
  );
}
