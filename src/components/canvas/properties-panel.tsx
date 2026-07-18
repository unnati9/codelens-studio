"use client";

import { useBoardStore } from "@/stores/board-store";
import { useCanvasUiStore } from "@/stores/canvas-ui-store";

export function PropertiesPanel({ onDelete }: { onDelete: (nodeId: string) => Promise<void> }) {
  const selectedNodeId = useCanvasUiStore((state) => state.selectedNodeId);
  const node = useBoardStore((state) =>
    state.nodes.find((candidate) => candidate.id === selectedNodeId),
  );

  return (
    <aside className="w-[280px] shrink-0 border-l border-[#dedbd2] bg-[#fffdf8] p-5">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#989a9e]">
        Properties
      </p>
      {node ? (
        <div className="mt-6">
          <p className="truncate text-sm font-bold text-[#263244]">
            {node.data.record.title || "Untitled node"}
          </p>
          <p className="mt-1 text-xs capitalize text-[#80838a]">{node.type} node</p>
          <dl className="mt-6 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-lg bg-[#f0eee8] p-3">
              <dt className="text-[#8b8d91]">Width</dt>
              <dd className="mt-1 font-bold">
                {Math.round(node.measured?.width ?? node.data.record.width)} px
              </dd>
            </div>
            <div className="rounded-lg bg-[#f0eee8] p-3">
              <dt className="text-[#8b8d91]">Height</dt>
              <dd className="mt-1 font-bold">
                {Math.round(node.measured?.height ?? node.data.record.height)} px
              </dd>
            </div>
            <div className="rounded-lg bg-[#f0eee8] p-3">
              <dt className="text-[#8b8d91]">X</dt>
              <dd className="mt-1 font-bold">{Math.round(node.position.x)}</dd>
            </div>
            <div className="rounded-lg bg-[#f0eee8] p-3">
              <dt className="text-[#8b8d91]">Y</dt>
              <dd className="mt-1 font-bold">{Math.round(node.position.y)}</dd>
            </div>
          </dl>
          <p className="mt-6 text-xs leading-5 text-[#85878c]">
            More annotation and review properties arrive after the Day 1 persistence gate.
          </p>
          <button
            type="button"
            data-testid="delete-node"
            onClick={() => void onDelete(node.id)}
            className="mt-8 w-full rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-100"
          >
            Delete node
          </button>
        </div>
      ) : (
        <div className="mt-6 rounded-xl border border-dashed border-[#d5d1c7] p-5 text-sm leading-6 text-[#85878c]">
          Select a code or image node to inspect its canvas properties.
        </div>
      )}
    </aside>
  );
}
