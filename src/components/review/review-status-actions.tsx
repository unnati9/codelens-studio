"use client";

import { getUnresolvedApprovalWarning, type ReviewAction } from "@/lib/review/status";
import type { BoardStatus } from "@/lib/validation/board";

type ReviewStatusActionsProps = {
  status: BoardStatus;
  openCount: number;
  updating: boolean;
  onAction: (action: ReviewAction) => Promise<void>;
};

const secondaryButton =
  "rounded-lg border border-[#dcd8cf] bg-white px-3 py-2 text-xs font-bold text-[#4d5663] hover:border-[#a8a398] disabled:cursor-wait disabled:opacity-50";
const primaryButton =
  "rounded-lg bg-[#15263d] px-3 py-2 text-xs font-bold text-white hover:bg-[#223a5a] disabled:cursor-wait disabled:opacity-50";

export function ReviewStatusActions({
  status,
  openCount,
  updating,
  onAction,
}: ReviewStatusActionsProps) {
  const act = (action: ReviewAction) => {
    if (action === "APPROVE") {
      const warning = getUnresolvedApprovalWarning(openCount);
      if (warning && !window.confirm(warning)) return;
    }
    void onAction(action);
  };

  if (status === "DRAFT") {
    return (
      <button
        type="button"
        disabled={updating}
        onClick={() => act("START_REVIEW")}
        className={primaryButton}
      >
        Start review
      </button>
    );
  }

  if (status === "APPROVED") {
    return (
      <button
        type="button"
        disabled={updating}
        onClick={() => act("RETURN_TO_DRAFT")}
        className={secondaryButton}
      >
        Return to draft
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {status === "CHANGES_REQUESTED" && (
        <button
          type="button"
          disabled={updating}
          onClick={() => act("START_REVIEW")}
          className={secondaryButton}
        >
          Resume review
        </button>
      )}
      {status === "IN_REVIEW" && (
        <button
          type="button"
          disabled={updating}
          onClick={() => act("REQUEST_CHANGES")}
          className={secondaryButton}
        >
          Request changes
        </button>
      )}
      <button
        type="button"
        disabled={updating}
        onClick={() => act("APPROVE")}
        className={primaryButton}
      >
        Approve
      </button>
      <button
        type="button"
        disabled={updating}
        onClick={() => act("RETURN_TO_DRAFT")}
        className={secondaryButton}
      >
        Draft
      </button>
    </div>
  );
}
