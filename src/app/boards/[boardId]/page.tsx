import type { Metadata } from "next";
import { BoardWorkspace } from "@/components/canvas/board-workspace";

export const metadata: Metadata = { title: "Review board" };

export default async function BoardPage({
  params,
  searchParams,
}: {
  params: Promise<{ boardId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { boardId } = await params;
  const query = await searchParams;
  return (
    <BoardWorkspace
      boardId={boardId}
      initialGitHubDrawerOpen={query.drawer === "github" || query.github !== undefined}
    />
  );
}
