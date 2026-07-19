"use client";

import { createContext, useContext } from "react";
import type { ResizeParams } from "@xyflow/react";
import type { BoardNodeContent } from "@/lib/validation/board";

export type BoardNodeActions = {
  beginNodeInteraction: (nodeId: string) => void;
  updateNode: (
    nodeId: string,
    updates: { title?: string | null; content?: BoardNodeContent },
  ) => void;
  commitResize: (nodeId: string, bounds: ResizeParams) => void;
  uploadImage: (nodeId: string, file: File) => Promise<void>;
};

export const BoardNodeActionsContext = createContext<BoardNodeActions | null>(null);

export function useBoardNodeActions() {
  const actions = useContext(BoardNodeActionsContext);
  if (!actions) {
    throw new Error("Board node actions are unavailable outside the workspace.");
  }
  return actions;
}
