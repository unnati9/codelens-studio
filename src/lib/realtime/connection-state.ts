import type { REALTIME_SUBSCRIBE_STATES } from "@supabase/supabase-js";
import type { RealtimeConnectionState } from "./presence";

export function connectionStateForSubscriptionStatus(
  status: REALTIME_SUBSCRIBE_STATES,
  options: { online: boolean; hasConnected: boolean },
): RealtimeConnectionState {
  if (!options.online) return "OFFLINE";
  if (status === "SUBSCRIBED") return "CONNECTED";
  if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
    return options.hasConnected ? "RECONNECTING" : "FAILED";
  }
  return options.hasConnected ? "RECONNECTING" : "CONNECTING";
}
