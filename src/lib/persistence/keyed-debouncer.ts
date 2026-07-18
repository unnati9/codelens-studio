export type KeyedDebouncer<T> = ReturnType<typeof createKeyedDebouncer<T>>;

export function createKeyedDebouncer<T>(
  callback: (value: T) => Promise<void> | void,
  delayMs: number,
) {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const pendingValues = new Map<string, T>();

  async function run(key: string) {
    const value = pendingValues.get(key);
    timers.delete(key);
    pendingValues.delete(key);

    if (value !== undefined) {
      await callback(value);
    }
  }

  return {
    schedule(key: string, value: T) {
      const existingTimer = timers.get(key);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      pendingValues.set(key, value);
      timers.set(
        key,
        setTimeout(() => {
          void run(key);
        }, delayMs),
      );
    },

    async flush(key?: string) {
      const keys = key ? [key] : [...pendingValues.keys()];
      await Promise.all(
        keys.map(async (pendingKey) => {
          const timer = timers.get(pendingKey);
          if (timer) {
            clearTimeout(timer);
          }
          await run(pendingKey);
        }),
      );
    },

    cancelAll() {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      pendingValues.clear();
    },

    hasPending() {
      return pendingValues.size > 0;
    },
  };
}
