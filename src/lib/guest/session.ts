let browserSessionId: string | null = null;

export function getBrowserSessionId(): string {
  if (!browserSessionId) browserSessionId = crypto.randomUUID();
  return browserSessionId;
}
