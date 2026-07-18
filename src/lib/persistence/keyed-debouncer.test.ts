import { afterEach, describe, expect, it, vi } from "vitest";
import { createKeyedDebouncer } from "./keyed-debouncer";

afterEach(() => {
  vi.useRealTimers();
});

describe("createKeyedDebouncer", () => {
  it("persists only the latest value for a node", async () => {
    vi.useFakeTimers();
    const persist = vi.fn();
    const debouncer = createKeyedDebouncer(persist, 500);

    debouncer.schedule("node-1", { x: 10 });
    debouncer.schedule("node-1", { x: 40 });
    debouncer.schedule("node-1", { x: 90 });

    await vi.advanceTimersByTimeAsync(499);
    expect(persist).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith({ x: 90 });
  });

  it("tracks different nodes independently", async () => {
    vi.useFakeTimers();
    const persist = vi.fn();
    const debouncer = createKeyedDebouncer(persist, 250);

    debouncer.schedule("node-1", "first");
    debouncer.schedule("node-2", "second");
    await vi.advanceTimersByTimeAsync(250);

    expect(persist).toHaveBeenCalledTimes(2);
  });
});
