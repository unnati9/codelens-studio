import { describe, expect, it } from "vitest";
import { getUnresolvedApprovalWarning, transitionBoardStatus } from "./status";

describe("board review status", () => {
  it("supports the review status transitions", () => {
    expect(transitionBoardStatus("DRAFT", "START_REVIEW")).toBe("IN_REVIEW");
    expect(transitionBoardStatus("IN_REVIEW", "REQUEST_CHANGES")).toBe("CHANGES_REQUESTED");
    expect(transitionBoardStatus("CHANGES_REQUESTED", "START_REVIEW")).toBe("IN_REVIEW");
    expect(transitionBoardStatus("CHANGES_REQUESTED", "APPROVE")).toBe("APPROVED");
    expect(transitionBoardStatus("APPROVED", "RETURN_TO_DRAFT")).toBe("DRAFT");
  });

  it("warns before approval when unresolved threads remain", () => {
    expect(getUnresolvedApprovalWarning(2)).toContain("2 unresolved comment threads");
    expect(getUnresolvedApprovalWarning(0)).toBeNull();
  });
});
