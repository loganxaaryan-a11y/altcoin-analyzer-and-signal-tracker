export interface Clock {
  now(): number;
}

export function systemClock(): Clock {
  return { now: () => Date.now() };
}

/** Deterministic clock for tests: starts at `startMs`, advanced manually. */
export function manualClock(startMs: number): Clock & { advance(ms: number): void; set(ms: number): void } {
  let t = startMs;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
    set: (ms: number) => {
      t = ms;
    },
  };
}
