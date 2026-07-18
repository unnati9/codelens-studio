import type { Metadata } from "next";
import { BoardsPage } from "@/components/boards/boards-page";

export const metadata: Metadata = { title: "Boards" };

export default function BoardsRoute() {
  return <BoardsPage />;
}
