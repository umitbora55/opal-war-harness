export interface SyntheticClock {
  now(): number;
  nowIso(): string;
  advanceBy(ms: number): number;
  set(ms: number): number;
}

export function createSyntheticClock(startAtMs: number): SyntheticClock {
  let current = startAtMs;

  return {
    now: () => current,
    nowIso: () => new Date(current).toISOString(),
    advanceBy: (ms: number) => {
      current += Math.max(0, ms);
      return current;
    },
    set: (ms: number) => {
      current = ms;
      return current;
    },
  };
}
