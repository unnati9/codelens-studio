export type VersionedRecord = {
  updatedAt?: string;
  updated_at?: string;
};

export function getUpdatedAt(record: VersionedRecord): string {
  const value = record.updatedAt ?? record.updated_at;
  if (!value || !Number.isFinite(Date.parse(value))) {
    throw new Error("Realtime records require a valid updated timestamp.");
  }
  return value;
}

export function shouldApplyVersionedRecord<T extends VersionedRecord>(
  current: T | null | undefined,
  incoming: T,
): boolean {
  if (!current) return true;
  const incomingTimestamp = Date.parse(getUpdatedAt(incoming));
  const currentTimestamp = Date.parse(getUpdatedAt(current));
  if (incomingTimestamp !== currentTimestamp) return incomingTimestamp > currentTimestamp;
  return JSON.stringify(incoming) !== JSON.stringify(current);
}

export function upsertVersionedRecord<T extends VersionedRecord & { id: string }>(
  records: T[],
  incoming: T,
): T[] {
  const index = records.findIndex((record) => record.id === incoming.id);
  if (index === -1) return [...records, incoming];
  if (!shouldApplyVersionedRecord(records[index], incoming)) return records;

  const next = [...records];
  next[index] = incoming;
  return next;
}

export function latestUpdatedAt(records: VersionedRecord[], fallback: string): string {
  return records.reduce((latest, record) => {
    const updatedAt = getUpdatedAt(record);
    return Date.parse(updatedAt) > Date.parse(latest) ? updatedAt : latest;
  }, fallback);
}
