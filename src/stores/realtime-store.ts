import { create } from "zustand";
import type { CollaboratorPresence, RealtimeConnectionState } from "@/lib/realtime/presence";

type RealtimeStore = {
  boardId: string | null;
  connectionState: RealtimeConnectionState;
  error: string | null;
  collaborators: CollaboratorPresence[];
  initialize: (boardId: string) => void;
  setConnection: (state: RealtimeConnectionState, error?: string | null) => void;
  setCollaborators: (collaborators: CollaboratorPresence[]) => void;
  reset: (boardId?: string) => void;
};

export const useRealtimeStore = create<RealtimeStore>((set) => ({
  boardId: null,
  connectionState: "CONNECTING",
  error: null,
  collaborators: [],
  initialize: (boardId) =>
    set({ boardId, connectionState: "CONNECTING", error: null, collaborators: [] }),
  setConnection: (connectionState, error = null) => set({ connectionState, error }),
  setCollaborators: (collaborators) => set({ collaborators }),
  reset: (boardId) =>
    set((state) =>
      boardId && state.boardId !== boardId
        ? state
        : {
            boardId: null,
            connectionState: "CONNECTING",
            error: null,
            collaborators: [],
          },
    ),
}));
