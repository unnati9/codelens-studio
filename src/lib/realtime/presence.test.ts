import { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { connectionStateForSubscriptionStatus } from "./connection-state";
import { createPresencePayload, normalizePresenceState } from "./presence";

const first = createPresencePayload({
  sessionId: "7995748f-7d76-4e45-9be5-cf82a6f868c9",
  guestId: "ca828087-d3d8-4487-a942-aac7a817e754",
  displayName: "Calm Reviewer 12",
  selectedNodeId: null,
  selectedAnnotationId: null,
  onlineAt: "2026-07-19T09:00:00.000Z",
});
const second = createPresencePayload({
  sessionId: "42fc8485-11b4-41e1-a951-87e5bc1cad9b",
  guestId: "bbff6953-971d-4e0e-bf70-5c019432310d",
  displayName: "Steady Builder 27",
  selectedNodeId: "a9c28c6e-34e3-49d1-b6ea-258b2487f414",
  selectedAnnotationId: null,
  onlineAt: "2026-07-19T09:00:01.000Z",
});

describe("realtime presence", () => {
  it("tracks joins and leaves from synchronized presence state", () => {
    const joined = normalizePresenceState({ one: [first], two: [second] });
    expect(joined).toHaveLength(2);
    expect(joined.map((presence) => presence.sessionId)).toContain(second.sessionId);

    const left = normalizePresenceState({ one: [first] });
    expect(left).toEqual([first]);
  });

  it("deduplicates a browser session and ignores malformed presence", () => {
    expect(normalizePresenceState({ one: [first, first, { displayName: "invalid" }] })).toEqual([
      first,
    ]);
  });
});

describe("realtime connection state transitions", () => {
  it("distinguishes initial failure, reconnecting, connected, and offline", () => {
    expect(
      connectionStateForSubscriptionStatus(REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR, {
        online: true,
        hasConnected: false,
      }),
    ).toBe("FAILED");
    expect(
      connectionStateForSubscriptionStatus(REALTIME_SUBSCRIBE_STATES.TIMED_OUT, {
        online: true,
        hasConnected: true,
      }),
    ).toBe("RECONNECTING");
    expect(
      connectionStateForSubscriptionStatus(REALTIME_SUBSCRIBE_STATES.SUBSCRIBED, {
        online: true,
        hasConnected: true,
      }),
    ).toBe("CONNECTED");
    expect(
      connectionStateForSubscriptionStatus(REALTIME_SUBSCRIBE_STATES.CLOSED, {
        online: false,
        hasConnected: true,
      }),
    ).toBe("OFFLINE");
  });
});
