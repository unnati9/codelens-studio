"use client";

import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type NodeMouseHandler,
  type NodeTypes,
} from "@xyflow/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnnotationLayer, type NewAnnotationInput } from "./annotation-layer";
import { AnnotationToolbar } from "./annotation-toolbar";
import { BoardNodeActionsContext, type BoardNodeActions } from "./board-node-actions";
import { CreationToolbar } from "./creation-toolbar";
import { PropertiesPanel } from "./properties-panel";
import { SaveIndicator } from "./save-indicator";
import { RealtimeIndicator } from "./realtime-indicator";
import {
  GitHubPrImportDialog,
  type GitHubImportResult,
} from "@/components/github/github-pr-import-dialog";
import { GitHubRepositoryDrawer } from "@/components/github/github-repository-drawer";
import {
  PreviewDeploymentPanel,
  previewDeploymentStatusLabel,
} from "@/components/preview-deployments/preview-deployment-panel";
import { ReviewPanel } from "@/components/review/review-panel";
import { ReviewStatusActions } from "@/components/review/review-status-actions";
import { Brand } from "@/components/ui/brand";
import { ConfigNotice } from "@/components/ui/config-notice";
import { CodeNode } from "@/components/nodes/code-node";
import { ImageNode } from "@/components/nodes/image-node";
import {
  createAnnotation,
  deleteAnnotation,
  listAnnotations,
  updateAnnotation,
} from "@/lib/data/annotations";
import { getBoard, updateBoardGitHubSource, updateBoardStatus } from "@/lib/data/boards";
import { syncGitHubBoard } from "@/lib/data/github";
import { refreshBoardPreviewDeployment } from "@/lib/data/preview-deployments";
import { uploadBoardImage } from "@/lib/data/media";
import {
  createBoardNode,
  createBoardNodes,
  deleteBoardNode,
  listBoardNodes,
  updateBoardNode,
} from "@/lib/data/nodes";
import {
  createCommentThread,
  createReviewComment,
  listReviewThreads,
  updateCommentThreadStatus,
} from "@/lib/data/review";
import { useGuestIdentity } from "@/lib/guest/use-guest-identity";
import { useBrowserSessionId } from "@/lib/guest/use-browser-session-id";
import { buildImportedCodeNodeRecords } from "@/lib/github/import";
import type { GitHubConnectedPullRequestRequest } from "@/lib/github/connected-schema";
import type { GitHubBoardSyncResponse } from "@/lib/github/board-sync-schema";
import type { GitHubChangedFile, GitHubPullRequest } from "@/lib/github/schema";
import { serializeBoardNode, type BoardFlowNode } from "@/lib/nodes/serialization";
import {
  previewDeploymentPollDelay,
  shouldPollPreviewDeployment,
} from "@/lib/preview-deployments/polling";
import { AnnotationSaveCoordinator } from "@/lib/persistence/annotation-save-coordinator";
import { BoardSaveCoordinator } from "@/lib/persistence/board-save-coordinator";
import { CombinedSaveState } from "@/lib/persistence/combined-save-state";
import type { BoardRealtimeChange } from "@/lib/realtime/events";
import { useBoardRealtime } from "@/lib/realtime/use-board-realtime";
import { shouldApplyVersionedRecord } from "@/lib/realtime/versioning";
import {
  createCommentDraft,
  createCommentThreadDraft,
  getThreadCounts,
  groupCommentsByThread,
} from "@/lib/review/threads";
import { transitionBoardStatus, type ReviewAction } from "@/lib/review/status";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  annotationSchema,
  type Annotation,
  type AnnotationGeometry,
  type AnnotationStyle,
} from "@/lib/validation/annotation";
import type { Board, BoardNodeContent, BoardNodeRecord } from "@/lib/validation/board";
import { reviewThreadSchema, type ReviewThread, type ThreadStatus } from "@/lib/validation/review";
import { useAnnotationStore } from "@/stores/annotation-store";
import { useBoardStore } from "@/stores/board-store";
import { useCanvasUiStore } from "@/stores/canvas-ui-store";
import { useReviewStore } from "@/stores/review-store";

const nodeTypes = {
  code: CodeNode,
  image: ImageNode,
} satisfies NodeTypes;

function makeNodeRecord(
  boardId: string,
  guestId: string,
  type: "code" | "image",
  index: number,
  zIndex: number,
): BoardNodeRecord {
  const now = new Date().toISOString();
  const content: BoardNodeContent =
    type === "code"
      ? {
          kind: "code",
          filename: "component.tsx",
          language: "typescript",
          code: "export function Component() {\n  return <button>Review</button>;\n}",
        }
      : {
          kind: "image",
          storagePath: null,
          fileName: null,
          mimeType: null,
          sizeBytes: null,
          naturalWidth: null,
          naturalHeight: null,
        };

  return {
    id: crypto.randomUUID(),
    board_id: boardId,
    type,
    title: type === "code" ? "Implementation" : "UI screenshot",
    position_x: 80 + (index % 5) * 44,
    position_y: 70 + (index % 5) * 38,
    width: type === "code" ? 520 : 460,
    height: type === "code" ? 380 : 340,
    z_index: zIndex,
    locked: false,
    content,
    created_by: guestId,
    created_at: now,
    updated_at: now,
  };
}

function offsetForDuplicate(annotation: Annotation): AnnotationGeometry {
  const delta = annotation.targetType === "NODE" ? 0.025 : 24;
  const geometry = annotation.geometry;
  const axisOffset = (minimum: number, maximum: number) => {
    if (annotation.targetType !== "NODE") return delta;
    if (maximum + delta <= 1) return delta;
    if (minimum - delta >= 0) return -delta;
    return 0;
  };

  if (annotation.tool === "FREEHAND") {
    const points = geometry.points ?? [];
    const xs = points.filter((_, index) => index % 2 === 0);
    const ys = points.filter((_, index) => index % 2 === 1);
    const dx = axisOffset(Math.min(...xs), Math.max(...xs));
    const dy = axisOffset(Math.min(...ys), Math.max(...ys));
    return {
      points: points.map((value, index) => value + (index % 2 === 0 ? dx : dy)),
    };
  }

  if (annotation.tool === "ARROW") {
    const endX = geometry.endX ?? 0;
    const endY = geometry.endY ?? 0;
    const startX = geometry.startX ?? 0;
    const startY = geometry.startY ?? 0;
    const dx = axisOffset(Math.min(startX, endX), Math.max(startX, endX));
    const dy = axisOffset(Math.min(startY, endY), Math.max(startY, endY));
    return {
      startX: startX + dx,
      startY: startY + dy,
      endX: endX + dx,
      endY: endY + dy,
    };
  }

  const x = geometry.x ?? 0;
  const y = geometry.y ?? 0;
  const width = geometry.width ?? 0;
  const height = geometry.height ?? 0;
  const dx = axisOffset(x, x + width);
  const dy = axisOffset(y, y + height);
  return { x: x + dx, y: y + dy, width, height };
}

export function BoardWorkspace({ boardId }: { boardId: string }) {
  const { identity } = useGuestIdentity();
  const sessionId = useBrowserSessionId();
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [reviewStatusUpdating, setReviewStatusUpdating] = useState(false);
  const [githubImportOpen, setGitHubImportOpen] = useState(false);
  const [githubDrawerOpen, setGitHubDrawerOpen] = useState(false);
  const [previewDeploymentPanelOpen, setPreviewDeploymentPanelOpen] = useState(false);
  const previewPollingAttempt = useRef(0);
  const [previewPollingError, setPreviewPollingError] = useState<string | null>(null);
  const localNodeInteractions = useRef(new Set<string>());
  const nodes = useBoardStore((state) => state.nodes);
  const annotations = useAnnotationStore((state) => state.annotations);
  const threads = useReviewStore((state) => state.threads);
  const applyChanges = useBoardStore((state) => state.applyChanges);
  const setNodes = useBoardStore((state) => state.setNodes);
  const configured = isSupabaseConfigured();
  const [combinedSaveState] = useState(
    () =>
      new CombinedSaveState((state, error) => {
        useCanvasUiStore.getState().setSaveState(state, error);
      }),
  );
  const saveCoordinator = useMemo(
    () =>
      new BoardSaveCoordinator(
        updateBoardNode,
        (state, error) => {
          combinedSaveState.update("nodes", state, error);
        },
        550,
        (record) => useBoardStore.getState().upsertRemoteRecord(record),
      ),
    [combinedSaveState],
  );
  const annotationSaveCoordinator = useMemo(
    () =>
      new AnnotationSaveCoordinator(
        updateAnnotation,
        (state, error) => {
          combinedSaveState.update("annotations", state, error);
        },
        350,
        (annotation) => useAnnotationStore.getState().upsertRemote(annotation),
      ),
    [combinedSaveState],
  );
  const annotationMode = useCanvasUiStore((state) => state.annotationMode);
  const annotationTool = useCanvasUiStore((state) => state.annotationTool);
  const annotationTargetType = useCanvasUiStore((state) => state.annotationTargetType);
  const annotationTargetNodeId = useCanvasUiStore((state) => state.annotationTargetNodeId);
  const annotationStyle = useCanvasUiStore((state) => state.annotationStyle);
  const annotationOverlayOpacity = useCanvasUiStore((state) => state.annotationOverlayOpacity);
  const annotationsVisible = useCanvasUiStore((state) => state.annotationsVisible);
  const selectedAnnotationId = useCanvasUiStore((state) => state.selectedAnnotationId);
  const selectedNodeId = useCanvasUiStore((state) => state.selectedNodeId);
  const reviewPanelOpen = useCanvasUiStore((state) => state.reviewPanelOpen);
  const threadFilter = useCanvasUiStore((state) => state.threadFilter);
  const threadCounts = useMemo(() => getThreadCounts(threads), [threads]);
  const resolvedAnnotationIds = useMemo(
    () =>
      new Set(
        threads
          .filter((thread) => thread.status === "RESOLVED")
          .map((thread) => thread.annotationId),
      ),
    [threads],
  );
  const selectedAnnotation =
    annotations.find((annotation) => annotation.id === selectedAnnotationId) ?? null;
  const interactiveNodes = useMemo(
    () =>
      annotationMode
        ? nodes.map((node) => ({ ...node, draggable: false, selectable: false }))
        : nodes,
    [annotationMode, nodes],
  );
  const serializedNodes = useMemo(() => nodes.map(serializeBoardNode), [nodes]);
  const staleGitHubNodeCount = useMemo(
    () =>
      serializedNodes.filter(
        (node) => node.content.kind === "code" && node.content.source?.isStale === true,
      ).length,
    [serializedNodes],
  );

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get("github") !== "connected") return;
    const timer = window.setTimeout(() => {
      setGitHubDrawerOpen(true);
      currentUrl.searchParams.delete("github");
      window.history.replaceState(
        null,
        "",
        `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`,
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (
      !board ||
      previewPollingError ||
      !shouldPollPreviewDeployment(board.preview_deployment_status)
    ) {
      if (!board || !shouldPollPreviewDeployment(board.preview_deployment_status)) {
        previewPollingAttempt.current = 0;
      }
      return;
    }
    const timer = window.setTimeout(() => {
      void refreshBoardPreviewDeployment(board.id)
        .then((result) => {
          previewPollingAttempt.current += 1;
          setBoard(result.board);
        })
        .catch((caughtError) => {
          setPreviewPollingError(
            caughtError instanceof Error
              ? caughtError.message
              : "Preview deployment polling failed.",
          );
        });
    }, previewDeploymentPollDelay(previewPollingAttempt.current));
    return () => window.clearTimeout(timer);
  }, [board, previewPollingError]);

  const reconcileWorkspace = useCallback(async () => {
    await Promise.all([saveCoordinator.flush(), annotationSaveCoordinator.flush()]);
    await Promise.all([saveCoordinator.retryFailed(), annotationSaveCoordinator.retryFailed()]);
    if (saveCoordinator.hasPending() || annotationSaveCoordinator.hasPending()) {
      throw new Error("Local changes are still waiting to sync.");
    }

    const [loadedBoard, loadedNodes, loadedAnnotations, loadedThreads] = await Promise.all([
      getBoard(boardId),
      listBoardNodes(boardId),
      listAnnotations(boardId),
      listReviewThreads(boardId),
    ]);
    const selectedId = useCanvasUiStore.getState().selectedNodeId;
    setBoard(loadedBoard);
    useBoardStore.getState().initialize(boardId, loadedNodes);
    useBoardStore.getState().setNodes(
      useBoardStore.getState().nodes.map((node) => ({
        ...node,
        selected: node.id === selectedId,
      })),
    );
    useAnnotationStore.getState().initialize(boardId, loadedAnnotations);
    useReviewStore.getState().initialize(boardId, loadedThreads);
    combinedSaveState.markAllSaved();
  }, [annotationSaveCoordinator, boardId, combinedSaveState, saveCoordinator]);

  const handleRealtimeChange = useCallback(
    (change: BoardRealtimeChange) => {
      if (change.action === "DELETE") {
        if (change.entity === "board") {
          if (change.id === boardId) setLoadError("This board was deleted in another session.");
          return;
        }
        if (change.entity === "node") {
          const node = useBoardStore
            .getState()
            .nodes.find((candidate) => candidate.id === change.id);
          if (!node) return;
          const removedAnnotationIds = useAnnotationStore
            .getState()
            .annotations.filter((annotation) => annotation.targetNodeId === change.id)
            .map((annotation) => annotation.id);
          saveCoordinator.discard(change.id);
          for (const annotationId of removedAnnotationIds) {
            annotationSaveCoordinator.discard(annotationId);
          }
          useBoardStore.getState().deleteRemoteRecord(change.id);
          useAnnotationStore.getState().removeForNode(change.id);
          useReviewStore.getState().removeForAnnotations(removedAnnotationIds);
          if (useCanvasUiStore.getState().selectedNodeId === change.id) {
            useCanvasUiStore.getState().selectNode(null);
          }
          return;
        }
        if (change.entity === "annotation") {
          if (!useAnnotationStore.getState().get(change.id)) return;
          annotationSaveCoordinator.discard(change.id);
          useAnnotationStore.getState().deleteRemote(change.id);
          useReviewStore.getState().removeForAnnotation(change.id);
          if (useCanvasUiStore.getState().selectedAnnotationId === change.id) {
            useCanvasUiStore.getState().selectAnnotation(null);
          }
          return;
        }
        if (change.entity === "thread") {
          if (!useReviewStore.getState().threads.some((thread) => thread.id === change.id)) return;
          useReviewStore.getState().deleteRemoteThread(change.id);
          return;
        }
        const review = useReviewStore.getState();
        if (
          review.pendingComments.some((comment) => comment.id === change.id) ||
          review.threads.some((thread) =>
            thread.comments.some((comment) => comment.id === change.id),
          )
        ) {
          review.deleteRemoteComment(change.id);
        }
        return;
      }

      switch (change.entity) {
        case "board":
          setBoard((current) =>
            shouldApplyVersionedRecord(current, change.record) ? change.record : current,
          );
          break;
        case "node":
          if (
            localNodeInteractions.current.has(change.record.id) ||
            saveCoordinator.hasPending(change.record.id)
          ) {
            return;
          }
          useBoardStore.getState().upsertRemoteRecord(change.record);
          break;
        case "annotation":
          if (annotationSaveCoordinator.hasPending(change.record.id)) return;
          useAnnotationStore.getState().upsertRemote(change.record);
          break;
        case "thread":
          useReviewStore.getState().upsertRemoteThread(change.record);
          break;
        case "comment":
          useReviewStore.getState().upsertRemoteComment(change.record);
          break;
      }
    },
    [annotationSaveCoordinator, boardId, saveCoordinator],
  );

  useBoardRealtime({
    enabled: Boolean(board && !loading && !loadError),
    boardId,
    identity,
    sessionId,
    selectedNodeId,
    selectedAnnotationId,
    onChange: handleRealtimeChange,
    onReconnect: reconcileWorkspace,
  });

  const queueNodeSave = useCallback(
    (nodeId: string) => {
      const record = useBoardStore.getState().getSerializedNode(nodeId);
      if (!record) return;
      saveCoordinator.queue(record);
    },
    [saveCoordinator],
  );

  useEffect(() => {
    if (!configured || !identity) return;
    let cancelled = false;

    async function loadWorkspace() {
      setLoading(true);
      setLoadError(null);
      useCanvasUiStore.getState().reset();

      try {
        const [loadedBoard, loadedNodes, loadedAnnotations, loadedThreads] = await Promise.all([
          getBoard(boardId),
          listBoardNodes(boardId),
          listAnnotations(boardId),
          listReviewThreads(boardId),
        ]);
        if (cancelled) return;
        setBoard(loadedBoard);
        useBoardStore.getState().initialize(boardId, loadedNodes);
        useAnnotationStore.getState().initialize(boardId, loadedAnnotations);
        useReviewStore.getState().initialize(boardId, loadedThreads);
        combinedSaveState.markAllSaved();
      } catch (caughtError) {
        if (cancelled) return;
        setLoadError(caughtError instanceof Error ? caughtError.message : "Could not open board.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadWorkspace();
    return () => {
      cancelled = true;
    };
  }, [boardId, combinedSaveState, configured, identity, reloadKey]);

  useEffect(() => {
    const handlePageExit = () => {
      void saveCoordinator.flush();
      void annotationSaveCoordinator.flush();
    };
    window.addEventListener("beforeunload", handlePageExit);

    return () => {
      window.removeEventListener("beforeunload", handlePageExit);
      void saveCoordinator.flush();
      void annotationSaveCoordinator.flush();
    };
  }, [annotationSaveCoordinator, saveCoordinator]);

  const updateNode = useCallback<BoardNodeActions["updateNode"]>(
    (nodeId, updates) => {
      useBoardStore.getState().updateRecord(nodeId, updates);
      queueNodeSave(nodeId);
    },
    [queueNodeSave],
  );

  const beginNodeInteraction = useCallback<BoardNodeActions["beginNodeInteraction"]>((nodeId) => {
    localNodeInteractions.current.add(nodeId);
  }, []);

  const commitResize = useCallback<BoardNodeActions["commitResize"]>(
    (nodeId, { x, y, width, height }) => {
      const currentNodes = useBoardStore.getState().nodes;
      useBoardStore.getState().setNodes(
        currentNodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                position: { x, y },
                width,
                height,
                measured: { width, height },
                style: { ...node.style, width, height },
                data: {
                  record: {
                    ...node.data.record,
                    position_x: x,
                    position_y: y,
                    width,
                    height,
                  },
                },
              }
            : node,
        ),
      );
      queueNodeSave(nodeId);
      void saveCoordinator
        .flush(nodeId)
        .finally(() => localNodeInteractions.current.delete(nodeId));
    },
    [queueNodeSave, saveCoordinator],
  );

  const uploadImage = useCallback<BoardNodeActions["uploadImage"]>(
    async (nodeId, file) => {
      const original = useBoardStore.getState().getSerializedNode(nodeId);
      if (!original || original.content.kind !== "image") return;

      saveCoordinator.beginImmediate();
      try {
        const content = await uploadBoardImage(boardId, file);
        useBoardStore.getState().updateRecord(nodeId, { content });
        queueNodeSave(nodeId);
        await saveCoordinator.flush(nodeId);

        const saveSnapshot = saveCoordinator.getSnapshot();
        if (saveSnapshot.state === "failed") {
          throw new Error(saveSnapshot.error || "Could not save the uploaded image.");
        }
        saveCoordinator.finishImmediate();
      } catch (caughtError) {
        saveCoordinator.discard(nodeId);
        useBoardStore.getState().updateRecord(nodeId, { content: original.content });
        const message =
          caughtError instanceof Error ? caughtError.message : "Could not upload image.";
        saveCoordinator.failImmediate(message);
        throw caughtError;
      }
    },
    [boardId, queueNodeSave, saveCoordinator],
  );

  const addNode = useCallback(
    async (type: "code" | "image") => {
      if (!identity) return;
      const currentNodes = useBoardStore.getState().nodes;
      const maxZIndex = currentNodes.reduce(
        (maximum, node) => Math.max(maximum, node.zIndex ?? 0),
        0,
      );
      const record = makeNodeRecord(boardId, identity.id, type, currentNodes.length, maxZIndex + 1);

      saveCoordinator.beginImmediate();
      try {
        const savedRecord = await createBoardNode(record);
        useBoardStore.getState().addRecord(savedRecord);
        useCanvasUiStore.getState().selectNode(savedRecord.id);
        saveCoordinator.finishImmediate();
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : "Could not create node.";
        saveCoordinator.failImmediate(message);
      }
    },
    [boardId, identity, saveCoordinator],
  );

  const deleteNode = useCallback(
    async (nodeId: string) => {
      await saveCoordinator.flush(nodeId);
      saveCoordinator.beginImmediate();
      try {
        const removedAnnotationIds = useAnnotationStore
          .getState()
          .annotations.filter((annotation) => annotation.targetNodeId === nodeId)
          .map((annotation) => annotation.id);
        await deleteBoardNode(boardId, nodeId);
        saveCoordinator.discard(nodeId);
        for (const annotationId of removedAnnotationIds) {
          annotationSaveCoordinator.discard(annotationId);
        }
        useBoardStore.getState().removeNode(nodeId);
        useAnnotationStore.getState().removeForNode(nodeId);
        useReviewStore.getState().removeForAnnotations(removedAnnotationIds);
        useCanvasUiStore.getState().selectNode(null);
        saveCoordinator.finishImmediate();
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : "Could not delete node.";
        saveCoordinator.failImmediate(message);
      }
    },
    [annotationSaveCoordinator, boardId, saveCoordinator],
  );

  const persistNewAnnotation = useCallback(
    async (input: NewAnnotationInput) => {
      if (!identity) return;
      const now = new Date().toISOString();
      const annotation = annotationSchema.parse({
        id: crypto.randomUUID(),
        boardId,
        ...input,
        createdBy: identity.id,
        createdAt: now,
        updatedAt: now,
      });

      useAnnotationStore.getState().add(annotation);
      useCanvasUiStore.getState().selectAnnotation(annotation.id);
      saveCoordinator.beginImmediate();
      try {
        const saved = await createAnnotation(annotation);
        useAnnotationStore.getState().replace(saved);
        saveCoordinator.finishImmediate();
      } catch (caughtError) {
        useAnnotationStore.getState().remove(annotation.id);
        useCanvasUiStore.getState().selectAnnotation(null);
        saveCoordinator.failImmediate(
          caughtError instanceof Error ? caughtError.message : "Could not create annotation.",
        );
      }
    },
    [boardId, identity, saveCoordinator],
  );

  const handleCreateAnnotation = useCallback(
    (input: NewAnnotationInput) => {
      void persistNewAnnotation(input);
    },
    [persistNewAnnotation],
  );

  const handleAnnotationStyleChange = useCallback(
    (annotationId: string, style: AnnotationStyle) => {
      useAnnotationStore.getState().update(annotationId, { style });
      const annotation = useAnnotationStore.getState().get(annotationId);
      if (annotation) annotationSaveCoordinator.queue(annotation);
    },
    [annotationSaveCoordinator],
  );

  const handleDeleteAnnotation = useCallback(
    async (annotationId: string) => {
      const annotation = useAnnotationStore.getState().get(annotationId);
      if (!annotation) return;
      await annotationSaveCoordinator.flush(annotationId);
      useAnnotationStore.getState().remove(annotationId);
      useCanvasUiStore.getState().selectAnnotation(null);
      saveCoordinator.beginImmediate();
      try {
        await deleteAnnotation(boardId, annotationId);
        annotationSaveCoordinator.discard(annotationId);
        useReviewStore.getState().removeForAnnotation(annotationId);
        saveCoordinator.finishImmediate();
      } catch (caughtError) {
        useAnnotationStore.getState().add(annotation);
        useCanvasUiStore.getState().selectAnnotation(annotationId);
        saveCoordinator.failImmediate(
          caughtError instanceof Error ? caughtError.message : "Could not delete annotation.",
        );
      }
    },
    [annotationSaveCoordinator, boardId, saveCoordinator],
  );

  const handleDuplicateAnnotation = useCallback(
    async (annotationId: string) => {
      const source = useAnnotationStore.getState().get(annotationId);
      if (!source) return;
      await persistNewAnnotation({
        targetType: source.targetType,
        targetNodeId: source.targetNodeId,
        tool: source.tool,
        geometry: offsetForDuplicate(source),
        style: source.style,
      });
    },
    [persistNewAnnotation],
  );

  const handleNodeClick = useCallback<NodeMouseHandler<BoardFlowNode>>(
    (_event, node) => {
      useCanvasUiStore.getState().selectNode(node.id);
      const currentNodes = useBoardStore.getState().nodes;
      const maxZIndex = currentNodes.reduce(
        (maximum, candidate) => Math.max(maximum, candidate.zIndex ?? 0),
        0,
      );
      if ((node.zIndex ?? 0) < maxZIndex) {
        useBoardStore.getState().updateRecord(node.id, { z_index: maxZIndex + 1 });
        queueNodeSave(node.id);
      }
    },
    [queueNodeSave],
  );

  const handleCreateThread = useCallback(
    async (annotationId: string, body: string) => {
      if (!identity) return;
      const threadDraft = createCommentThreadDraft({
        boardId,
        annotationId,
        guestId: identity.id,
      });
      const commentDraft = createCommentDraft({
        boardId,
        threadId: threadDraft.id,
        authorId: identity.id,
        authorName: identity.displayName,
        body,
      });
      let savedThread: Awaited<ReturnType<typeof createCommentThread>> | null = null;

      saveCoordinator.beginImmediate();
      try {
        savedThread = await createCommentThread(threadDraft);
        const savedComment = await createReviewComment(commentDraft);
        const reviewThread = groupCommentsByThread([savedThread], [savedComment])[0];
        useReviewStore.getState().add(reviewThread);
        saveCoordinator.finishImmediate();
      } catch (caughtError) {
        if (savedThread) {
          useReviewStore.getState().add(groupCommentsByThread([savedThread], [])[0]);
        }
        const message =
          caughtError instanceof Error ? caughtError.message : "Could not create comment thread.";
        saveCoordinator.failImmediate(message);
        throw caughtError;
      }
    },
    [boardId, identity, saveCoordinator],
  );

  const handleReply = useCallback(
    async (threadId: string, body: string) => {
      if (!identity) return;
      const comment = createCommentDraft({
        boardId,
        threadId,
        authorId: identity.id,
        authorName: identity.displayName,
        body,
      });
      saveCoordinator.beginImmediate();
      try {
        const saved = await createReviewComment(comment);
        useReviewStore.getState().addComment(threadId, saved);
        saveCoordinator.finishImmediate();
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : "Could not send reply.";
        saveCoordinator.failImmediate(message);
        throw caughtError;
      }
    },
    [boardId, identity, saveCoordinator],
  );

  const handleThreadStatusChange = useCallback(
    async (thread: ReviewThread, status: ThreadStatus) => {
      if (!identity) return;
      saveCoordinator.beginImmediate();
      try {
        const saved = await updateCommentThreadStatus(thread.id, status, identity.id);
        useReviewStore.getState().replace(
          reviewThreadSchema.parse({
            ...thread,
            ...saved,
            latestActivityAt: saved.updatedAt,
          }),
        );
        saveCoordinator.finishImmediate();
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : "Could not update comment thread.";
        saveCoordinator.failImmediate(message);
        throw caughtError;
      }
    },
    [identity, saveCoordinator],
  );

  const handleSelectThread = useCallback((thread: ReviewThread) => {
    const annotation = useAnnotationStore.getState().get(thread.annotationId);
    if (!annotation) return;
    const ui = useCanvasUiStore.getState();
    ui.setAnnotationsVisible(true);
    ui.openReviewPanel(annotation.id);
    ui.selectNode(annotation.targetNodeId ?? null);
    useBoardStore.getState().setNodes(
      useBoardStore.getState().nodes.map((node) => ({
        ...node,
        selected: node.id === annotation.targetNodeId,
      })),
    );
    if (ui.annotationMode) ui.setAnnotationTool("SELECT");
  }, []);

  const handleReviewAction = useCallback(
    async (action: ReviewAction) => {
      if (!board || reviewStatusUpdating) return;
      const status = transitionBoardStatus(board.status, action);
      setReviewStatusUpdating(true);
      saveCoordinator.beginImmediate();
      try {
        const savedBoard = await updateBoardStatus(board.id, status);
        setBoard(savedBoard);
        saveCoordinator.finishImmediate();
      } catch (caughtError) {
        saveCoordinator.failImmediate(
          caughtError instanceof Error ? caughtError.message : "Could not update review status.",
        );
      } finally {
        setReviewStatusUpdating(false);
      }
    },
    [board, reviewStatusUpdating, saveCoordinator],
  );

  const handleGitHubSync = useCallback(
    async (selection?: GitHubConnectedPullRequestRequest): Promise<GitHubBoardSyncResponse> => {
      saveCoordinator.beginImmediate();
      try {
        const result = await syncGitHubBoard({ boardId, selection });
        setBoard(result.board);
        for (const record of result.staleNodes) {
          useBoardStore.getState().replaceRecord(record);
        }
        saveCoordinator.finishImmediate();
        return result;
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : "Could not sync the pull request.";
        saveCoordinator.failImmediate(message);
        throw caughtError;
      }
    },
    [boardId, saveCoordinator],
  );

  const handleGitHubImport = useCallback(
    async (
      pullRequest: GitHubPullRequest,
      selectedFiles: GitHubChangedFile[],
    ): Promise<GitHubImportResult> => {
      if (!identity) return { importedCount: 0, skippedCount: 0 };
      const existingRecords = useBoardStore.getState().nodes.map(serializeBoardNode);
      const importedAt = new Date().toISOString();
      const { records, skippedFiles } = buildImportedCodeNodeRecords({
        boardId,
        guestId: identity.id,
        pullRequest,
        selectedFiles,
        existingNodes: existingRecords,
        importedAt,
      });
      const [owner, repository] = pullRequest.repositoryFullName.split("/");
      if (!owner || !repository) throw new Error("GitHub returned an invalid repository name.");

      saveCoordinator.beginImmediate();
      try {
        const savedRecords = await createBoardNodes(records);
        for (const record of savedRecords) useBoardStore.getState().addRecord(record);
        const savedBoard = await updateBoardGitHubSource(boardId, {
          owner,
          repository,
          pullRequestNumber: pullRequest.pullNumber,
          pullRequestUrl: pullRequest.htmlUrl,
          headCommitSha: pullRequest.headCommitSha,
          baseBranch: pullRequest.baseBranch,
          headBranch: pullRequest.headBranch,
          baseCommitSha: pullRequest.baseCommitSha,
          authorLogin: pullRequest.authorLogin,
          pullRequestTitle: pullRequest.title,
          pullRequestDescription: pullRequest.description,
          changedFileCount: pullRequest.changedFileCount,
          lastSyncedAt: importedAt,
          lastImportedAt: importedAt,
        });
        setBoard(savedBoard);
        if (savedRecords.at(-1)) {
          useCanvasUiStore.getState().selectNode(savedRecords.at(-1)?.id ?? null);
        }
        saveCoordinator.finishImmediate();
        return { importedCount: savedRecords.length, skippedCount: skippedFiles.length };
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : "Could not import GitHub files.";
        saveCoordinator.failImmediate(message);
        throw caughtError;
      }
    },
    [boardId, identity, saveCoordinator],
  );

  const actions: BoardNodeActions = {
    beginNodeInteraction,
    updateNode,
    commitResize,
    uploadImage,
  };

  if (!configured) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div className="max-w-xl">
          <ConfigNotice />
        </div>
      </main>
    );
  }

  if (loading || !identity) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#15263d] text-white">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-[#ff5a36]" />
          <p className="mt-4 text-sm font-bold">Opening review canvas…</p>
        </div>
      </main>
    );
  }

  if (loadError || !board) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f4f2ed] p-6 text-center">
        <div className="max-w-md rounded-2xl border border-red-200 bg-white p-8 shadow-sm">
          <h1 className="text-xl font-black text-[#15263d]">This board could not be opened</h1>
          <p className="mt-3 text-sm leading-6 text-[#6e7178]">
            {loadError || "The board was not found."}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
              className="rounded-xl bg-[#15263d] px-4 py-2 text-sm font-bold text-white"
            >
              Retry
            </button>
            <Link
              href="/boards"
              className="rounded-xl border border-[#d8d3c8] px-4 py-2 text-sm font-bold text-[#15263d]"
            >
              All boards
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <BoardNodeActionsContext.Provider value={actions}>
      <main
        data-testid="board-workspace"
        data-board-id={board.id}
        className="flex h-screen min-w-[1024px] flex-col overflow-hidden bg-[#e9e7e1]"
      >
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-[#dedbd2] bg-[#fffdf8] px-5">
          <Brand compact />
          <span className="text-[#c2beb4]">/</span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold text-[#253348]">{board.title}</h1>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#92949a]">
              {board.status.replaceAll("_", " ")}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {board.source_type === "GITHUB_PR" && (
              <button
                type="button"
                data-testid="open-preview-deployment"
                onClick={() => setPreviewDeploymentPanelOpen(true)}
                className="rounded-lg border border-[#dcd8cf] bg-white px-3 py-2 text-xs font-bold text-[#4d5663] hover:border-[#ff5a36]"
                title={
                  previewPollingError ??
                  board.preview_failure_reason ??
                  "Configure preview deployment discovery"
                }
              >
                Preview ·{" "}
                {previewPollingError
                  ? "Refresh failed"
                  : previewDeploymentStatusLabel(board.preview_deployment_status)}
              </button>
            )}
            {board.source_type === "GITHUB_PR" && (
              <button
                type="button"
                data-testid="open-github-pr"
                onClick={() => setGitHubDrawerOpen(true)}
                className="rounded-lg border border-[#dcd8cf] bg-white px-3 py-2 text-xs font-bold text-[#4d5663] hover:border-[#ff5a36]"
                title={`${board.github_owner}/${board.github_repository} #${board.github_pull_request_number}`}
              >
                Sync PR{staleGitHubNodeCount > 0 ? ` · ${staleGitHubNodeCount} stale` : ""}
              </button>
            )}
            <ReviewStatusActions
              status={board.status}
              openCount={threadCounts.open}
              updating={reviewStatusUpdating}
              onAction={handleReviewAction}
            />
            <button
              type="button"
              data-testid="open-comments"
              onClick={() => useCanvasUiStore.getState().openReviewPanel(null)}
              className="rounded-lg border border-[#dcd8cf] bg-white px-3 py-2 text-xs font-bold text-[#4d5663] hover:border-[#a8a398]"
            >
              Comments {threadCounts.open}
            </button>
            <span className="hidden text-xs font-medium text-[#74777d] xl:block">
              {identity.displayName}
            </span>
            <RealtimeIndicator sessionId={sessionId} />
            <SaveIndicator />
            <Link
              href="/boards"
              className="rounded-lg border border-[#dcd8cf] bg-white px-3 py-2 text-xs font-bold text-[#4d5663] hover:border-[#a8a398]"
            >
              Boards
            </Link>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <CreationToolbar
            onAddCode={() => void addNode("code")}
            onAddImage={() => void addNode("image")}
            onImportGitHub={() => {
              if (annotationMode) useCanvasUiStore.getState().exitAnnotationMode();
              setGitHubDrawerOpen(true);
            }}
            annotationMode={annotationMode}
            onToggleAnnotations={() => {
              const ui = useCanvasUiStore.getState();
              if (ui.annotationMode) {
                ui.exitAnnotationMode();
              } else {
                ui.enterAnnotationMode(ui.selectedNodeId);
              }
            }}
          />
          <section
            data-testid="review-canvas"
            className="relative min-w-0 flex-1"
            aria-label="Review canvas"
          >
            <ReactFlow<BoardFlowNode>
              nodes={interactiveNodes}
              edges={[]}
              nodeTypes={nodeTypes}
              onNodesChange={applyChanges}
              onNodeClick={annotationMode ? undefined : handleNodeClick}
              onPaneClick={() => useCanvasUiStore.getState().selectNode(null)}
              onNodeDragStart={(_event, node) => localNodeInteractions.current.add(node.id)}
              onNodeDragStop={(_event, node) => {
                const currentNodes = useBoardStore.getState().nodes;
                setNodes(
                  currentNodes.map((candidate) =>
                    candidate.id === node.id
                      ? {
                          ...candidate,
                          position: node.position,
                          data: {
                            record: {
                              ...candidate.data.record,
                              position_x: node.position.x,
                              position_y: node.position.y,
                            },
                          },
                        }
                      : candidate,
                  ),
                );
                queueNodeSave(node.id);
                void saveCoordinator
                  .flush(node.id)
                  .finally(() => localNodeInteractions.current.delete(node.id));
              }}
              fitView
              fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
              minZoom={0.25}
              maxZoom={2}
              nodesConnectable={false}
              nodesDraggable={!annotationMode}
              nodesFocusable={!annotationMode}
              elementsSelectable={!annotationMode}
              panOnDrag={!annotationMode}
              deleteKeyCode={null}
              selectionOnDrag={!annotationMode}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.3} color="#c4c0b7" />
              <Controls position="bottom-left" showInteractive={false} />
              <AnnotationLayer
                nodes={nodes}
                annotations={annotations}
                annotationMode={annotationMode}
                activeTool={annotationTool}
                targetType={annotationTargetType}
                targetNodeId={annotationTargetNodeId}
                style={annotationStyle}
                overlayOpacity={annotationOverlayOpacity}
                annotationsVisible={annotationsVisible}
                resolvedAnnotationIds={resolvedAnnotationIds}
                selectedAnnotationId={selectedAnnotationId}
                onCreate={handleCreateAnnotation}
                onSelect={(annotationId) => {
                  const ui = useCanvasUiStore.getState();
                  if (annotationId) ui.openReviewPanel(annotationId);
                  else ui.selectAnnotation(null);
                }}
              />
            </ReactFlow>
            {annotationMode && (
              <AnnotationToolbar
                nodes={nodes}
                selectedAnnotation={selectedAnnotation}
                onDelete={handleDeleteAnnotation}
                onDuplicate={handleDuplicateAnnotation}
                onStyleChange={handleAnnotationStyleChange}
              />
            )}
          </section>
          {reviewPanelOpen ? (
            <ReviewPanel
              annotations={annotations}
              identity={identity}
              threads={threads}
              selectedAnnotationId={selectedAnnotationId}
              filter={threadFilter}
              openCount={threadCounts.open}
              resolvedCount={threadCounts.resolved}
              onFilterChange={(filter) => useCanvasUiStore.getState().setThreadFilter(filter)}
              onClose={() => useCanvasUiStore.getState().closeReviewPanel()}
              onShowAll={() => useCanvasUiStore.getState().openReviewPanel(null)}
              onSelectThread={handleSelectThread}
              onCreateThread={handleCreateThread}
              onReply={handleReply}
              onStatusChange={handleThreadStatusChange}
            />
          ) : (
            <PropertiesPanel onDelete={deleteNode} />
          )}
        </div>
        {githubDrawerOpen && (
          <GitHubRepositoryDrawer
            board={board}
            existingNodes={serializedNodes}
            onClose={() => setGitHubDrawerOpen(false)}
            onUsePublicImport={() => {
              setGitHubDrawerOpen(false);
              setGitHubImportOpen(true);
            }}
            onSync={handleGitHubSync}
            onImport={handleGitHubImport}
          />
        )}
        {githubImportOpen && (
          <GitHubPrImportDialog
            boardId={boardId}
            existingNodes={serializedNodes}
            initialUrl={board.github_pull_request_url}
            onClose={() => setGitHubImportOpen(false)}
            onImport={handleGitHubImport}
          />
        )}
        {previewDeploymentPanelOpen && (
          <PreviewDeploymentPanel
            board={board}
            createdBy={identity.id}
            onClose={() => setPreviewDeploymentPanelOpen(false)}
            onBoardChange={(nextBoard) => {
              setPreviewPollingError(null);
              setBoard(nextBoard);
            }}
          />
        )}
      </main>
    </BoardNodeActionsContext.Provider>
  );
}
