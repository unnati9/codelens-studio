import type { Metadata } from "next";
import { BoardWorkspace } from "@/components/canvas/board-workspace";

export const metadata: Metadata = { title: "Review board" };

export default async function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  return <BoardWorkspace boardId={boardId} />;
}
