"use client";

import { useState } from "react";
import { getBrowserSessionId } from "./session";

export function useBrowserSessionId() {
  const [sessionId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : getBrowserSessionId(),
  );
  return sessionId;
}
