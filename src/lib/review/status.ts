import type { BoardStatus } from "@/lib/validation/board";

export type ReviewAction = "START_REVIEW" | "REQUEST_CHANGES" | "APPROVE" | "RETURN_TO_DRAFT";

export function transitionBoardStatus(
  currentStatus: BoardStatus,
  action: ReviewAction,
): BoardStatus {
  if (action === "RETURN_TO_DRAFT" && currentStatus !== "DRAFT") return "DRAFT";
  if (
    action === "START_REVIEW" &&
    (currentStatus === "DRAFT" || currentStatus === "CHANGES_REQUESTED")
  ) {
    return "IN_REVIEW";
  }
  if (action === "REQUEST_CHANGES" && currentStatus === "IN_REVIEW") {
    return "CHANGES_REQUESTED";
  }
  if (
    action === "APPROVE" &&
    (currentStatus === "IN_REVIEW" || currentStatus === "CHANGES_REQUESTED")
  ) {
    return "APPROVED";
  }

  throw new Error(`Cannot ${action.toLowerCase()} while a board is ${currentStatus}.`);
}

export function getUnresolvedApprovalWarning(openCount: number): string | null {
  if (openCount <= 0) return null;
  const label = openCount === 1 ? "comment thread is" : "comment threads are";
  return `${openCount} unresolved ${label} still open. Approve anyway?`;
}
