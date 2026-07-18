import { applyNodeChanges, type NodeChange } from "@xyflow/react";
import { create } from "zustand";
import {
  deserializeBoardNode,
  serializeBoardNode,
  updateFlowNodeRecord,
  type BoardFlowNode,
} from "@/lib/nodes/serialization";
import type { BoardNodeContent, BoardNodeRecord } from "@/lib/validation/board";

type BoardStore = {
  boardId: string | null;
  nodes: BoardFlowNode[];
  initialize: (boardId: string, records: BoardNodeRecord[]) => void;
  setNodes: (nodes: BoardFlowNode[]) => void;
  applyChanges: (changes: NodeChange<BoardFlowNode>[]) => void;
  addRecord: (record: BoardNodeRecord) => void;
  replaceRecord: (record: BoardNodeRecord) => void;
  updateRecord: (
    nodeId: string,
    updates: Partial<Pick<BoardNodeRecord, "title" | "locked">> & {
      content?: BoardNodeContent;
      z_index?: number;
    },
  ) => void;
  removeNode: (nodeId: string) => void;
  getSerializedNode: (nodeId: string) => BoardNodeRecord | null;
};

export const useBoardStore = create<BoardStore>((set, get) => ({
  boardId: null,
  nodes: [],

  initialize: (boardId, records) =>
    set({ boardId, nodes: records.map((record) => deserializeBoardNode(record)) }),

  setNodes: (nodes) => set({ nodes }),

  applyChanges: (changes) =>
    set((state) => ({ nodes: applyNodeChanges(changes, state.nodes) as BoardFlowNode[] })),

  addRecord: (record) =>
    set((state) => ({ nodes: [...state.nodes, deserializeBoardNode(record)] })),

  replaceRecord: (record) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === record.id ? deserializeBoardNode(record) : node,
      ),
    })),

  updateRecord: (nodeId, updates) =>
    set((state) => ({
      nodes: state.nodes.map((node) =>
        node.id === nodeId ? updateFlowNodeRecord(node, updates) : node,
      ),
    })),

  removeNode: (nodeId) =>
    set((state) => ({ nodes: state.nodes.filter((node) => node.id !== nodeId) })),

  getSerializedNode: (nodeId) => {
    const node = get().nodes.find((candidate) => candidate.id === nodeId);
    return node ? serializeBoardNode(node) : null;
  },
}));
