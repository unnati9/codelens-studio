"use client";

import { useEffect, useState } from "react";
import { getOrCreateGuestIdentity, type GuestIdentity } from "./identity";

export function useGuestIdentity() {
  const [identity, setIdentity] = useState<GuestIdentity | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIdentity(getOrCreateGuestIdentity());
    }, 0);

    return () => window.clearTimeout(timer);
  }, []);

  return { identity, setIdentity };
}
