import { z } from "zod";

export const realtimeConnectionStateSchema = z.enum([
  "CONNECTING",
  "CONNECTED",
  "RECONNECTING",
  "OFFLINE",
  "FAILED",
]);

export const collaboratorPresenceSchema = z.object({
  sessionId: z.string().uuid(),
  guestId: z.string().uuid(),
  displayName: z.string().trim().min(1).max(120),
  selectedNodeId: z.string().uuid().nullable(),
  selectedAnnotationId: z.string().uuid().nullable(),
  onlineAt: z.string().datetime({ offset: true }),
});

export type RealtimeConnectionState = z.infer<typeof realtimeConnectionStateSchema>;
export type CollaboratorPresence = z.infer<typeof collaboratorPresenceSchema>;

export function normalizePresenceState(input: unknown): CollaboratorPresence[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];

  const bySession = new Map<string, CollaboratorPresence>();
  for (const value of Object.values(input)) {
    if (!Array.isArray(value)) continue;
    for (const presence of value) {
      const parsed = collaboratorPresenceSchema.safeParse(presence);
      if (parsed.success) bySession.set(parsed.data.sessionId, parsed.data);
    }
  }

  return [...bySession.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
}

export function createPresencePayload(input: {
  sessionId: string;
  guestId: string;
  displayName: string;
  selectedNodeId: string | null;
  selectedAnnotationId: string | null;
  onlineAt?: string;
}): CollaboratorPresence {
  return collaboratorPresenceSchema.parse({
    ...input,
    onlineAt: input.onlineAt ?? new Date().toISOString(),
  });
}
