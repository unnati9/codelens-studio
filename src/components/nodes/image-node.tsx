"use client";

import { NodeResizer, type NodeProps } from "@xyflow/react";
import { useRef, useState } from "react";
import { useBoardNodeActions } from "@/components/canvas/board-node-actions";
import { getBoardImageUrl } from "@/lib/data/media";
import type { BoardFlowNode } from "@/lib/nodes/serialization";
import { validateImageFile } from "@/lib/validation/image";

export function ImageNode({ id, data, selected }: NodeProps<BoardFlowNode>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { beginNodeInteraction, updateNode, commitResize, uploadImage } = useBoardNodeActions();
  const record = data.record;
  const content = record.content;

  if (content.kind !== "image") return null;

  const imageUrl = content.storagePath ? getBoardImageUrl(content.storagePath) : null;
  const sourceLabel =
    content.source === "GENERATED_BASE_CAPTURE"
      ? "Generated base capture"
      : content.source === "GENERATED_PR_CAPTURE"
        ? "Generated PR capture"
        : "Manual upload";

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setUploadError(validation.message);
      return;
    }

    setUploading(true);
    setUploadError(null);
    try {
      await uploadImage(id, file);
    } catch (caughtError) {
      setUploadError(caughtError instanceof Error ? caughtError.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <article
      data-testid="image-node"
      data-node-id={id}
      data-position-x={record.position_x}
      data-position-y={record.position_y}
      data-width={record.width}
      data-height={record.height}
      className="flex h-full w-full flex-col overflow-hidden rounded-[18px] border border-[#d8d3c8] bg-[#fffdf8] shadow-[0_18px_45px_rgba(21,38,61,0.16)]"
    >
      <NodeResizer
        isVisible={selected}
        minWidth={280}
        minHeight={220}
        handleClassName="node-resize-handle"
        onResizeStart={() => beginNodeInteraction(id)}
        onResizeEnd={(_event, params) => commitResize(id, params)}
      />

      <div className="node-drag-handle flex cursor-grab items-center gap-3 border-b border-[#e6e1d7] bg-white px-4 py-3 active:cursor-grabbing">
        <span
          data-testid="node-drag-handle"
          className="grid h-7 w-7 place-items-center rounded-lg bg-[#e9edf2] text-xs font-black text-[#15263d]"
        >
          IMG
        </span>
        <input
          aria-label="Image node title"
          value={record.title ?? ""}
          onChange={(event) => updateNode(id, { title: event.target.value })}
          className="nodrag min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 text-sm font-bold text-[#263244] placeholder:text-[#92969d] hover:border-[#e1ddd5] focus:border-[#c7c2b8]"
          placeholder="UI screenshot"
        />
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#a0a1a4]">
          {sourceLabel}
        </span>
      </div>

      <div className="nodrag nowheel relative min-h-0 flex-1 overflow-hidden bg-[linear-gradient(45deg,#efede7_25%,transparent_25%),linear-gradient(-45deg,#efede7_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#efede7_75%),linear-gradient(-45deg,transparent_75%,#efede7_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px]">
        {imageUrl ? (
          // A native image is appropriate for user-supplied Supabase URLs with unknown hosts.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            data-testid="image-preview"
            src={imageUrl}
            alt={record.title || content.fileName || "Board image"}
            draggable={false}
            className="pointer-events-none h-full w-full select-none object-contain"
          />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="absolute inset-5 grid place-items-center rounded-xl border-2 border-dashed border-[#c9c5bc] bg-[#fffdf8]/90 text-center transition hover:border-[#ff5a36]"
          >
            <span>
              <span className="block text-sm font-bold text-[#263244]">Add a UI screenshot</span>
              <span className="mt-1 block text-xs text-[#777a80]">
                PNG, JPEG, or WebP · 8 MB max
              </span>
            </span>
          </button>
        )}

        {uploading && (
          <div className="absolute inset-0 grid place-items-center bg-[#15263d]/75 text-sm font-bold text-white">
            Uploading…
          </div>
        )}
      </div>

      <div className="nodrag flex min-h-11 items-center justify-between gap-3 border-t border-[#e6e1d7] bg-white px-4 py-2">
        <span className="min-w-0 truncate text-[11px] text-[#777a80]">
          {uploadError || content.fileName || sourceLabel}
        </span>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="shrink-0 text-xs font-bold text-[#e94929] disabled:opacity-50"
        >
          {imageUrl ? "Replace" : "Upload"}
        </button>
        <input
          ref={inputRef}
          data-testid="image-file-input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => void handleFile(event.target.files?.[0])}
        />
      </div>
    </article>
  );
}
