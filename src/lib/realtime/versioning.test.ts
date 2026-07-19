import { describe, expect, it } from "vitest";
import { shouldApplyVersionedRecord, upsertVersionedRecord } from "./versioning";

const current = {
  id: "a9c28c6e-34e3-49d1-b6ea-258b2487f414",
  value: "current",
  updated_at: "2026-07-19T09:00:00.000Z",
};

describe("realtime version reconciliation", () => {
  it("rejects stale events", () => {
    expect(
      shouldApplyVersionedRecord(current, {
        ...current,
        value: "stale",
        updated_at: "2026-07-19T08:59:59.000Z",
      }),
    ).toBe(false);
  });

  it("suppresses a local echo with identical data and timestamp", () => {
    expect(shouldApplyVersionedRecord(current, { ...current })).toBe(false);
    expect(upsertVersionedRecord([current], { ...current })).toEqual([current]);
  });

  it("accepts a newer record and an authoritative same-timestamp correction", () => {
    expect(
      shouldApplyVersionedRecord(current, {
        ...current,
        value: "newer",
        updated_at: "2026-07-19T09:00:01.000Z",
      }),
    ).toBe(true);
    expect(shouldApplyVersionedRecord(current, { ...current, value: "server value" })).toBe(true);
  });
});
