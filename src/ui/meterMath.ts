/**
 * The pitching meter's pure motion math, split out from the component so the
 * frame-timing edge cases are testable without a DOM.
 */

/** Where on the bar the accuracy line sits, in bar percent. */
export const ACC_TARGET = 18;
/** Bar percent per second at the baseline. */
export const BASE_SPEED = 145;
/** Largest frame delta we will honour, in seconds. */
export const MAX_DT = 0.05;

/**
 * Frame delta in seconds, clamped.
 *
 * A requestAnimationFrame timestamp marks the start of the frame, which can
 * predate the performance.now() captured when the loop was scheduled — so raw
 * deltas go negative on the first tick and the bar reads as having fallen to
 * zero before it ever rose. Clamping also stops a backgrounded tab from
 * teleporting the bar the moment it wakes up.
 */
export function frameDelta(now: number, last: number): number {
  return Math.min(MAX_DT, Math.max(0, (now - last) / 1000));
}

export interface Step {
  value: number;
  direction: 1 | -1;
  /** True when the bar bottomed out on the way down and the pitch auto-releases. */
  bottomedOut: boolean;
}

/**
 * Advance the bar one frame during the power stop. The bar climbs to the top,
 * turns over, and falls back; only a falling bar can bottom out, because on
 * the way up zero just means the delivery has not gotten going yet.
 */
export function stepPower(value: number, direction: 1 | -1, speed: number, dt: number): Step {
  let v = value + direction * speed * dt;
  let dir = direction;
  if (v >= 100) {
    v = 100;
    dir = -1;
  }
  if (dir < 0 && v <= 0) return { value: 0, direction: dir, bottomedOut: true };
  return { value: v, direction: dir, bottomedOut: false };
}

/** Advance the bar during the accuracy stop, where it only ever falls. */
export function stepAccuracy(value: number, speed: number, dt: number): Step {
  const v = value - speed * dt;
  if (v <= 0) return { value: 0, direction: -1, bottomedOut: true };
  return { value: v, direction: -1, bottomedOut: false };
}

/** Bar speed for a pitch, given its difficulty and how tired the arm is. */
export function meterSpeed(controlDifficulty: number, stamina: number): number {
  return BASE_SPEED * (1 + controlDifficulty * 0.45) * (1 + (1 - stamina) * 0.3);
}

/** Forgiving half-width of the accuracy window, shrinking as the arm tires. */
export function accuracyWindow(base: number, stamina: number): number {
  return base * (0.55 + 0.45 * stamina);
}

/** Convert a power stop into the engine's 0..1 shortfall. */
export function powerErrorOf(powerStop: number | null): number {
  const shortfall = powerStop === null ? 1 : (100 - powerStop) / 100;
  return Math.max(0, shortfall - 0.05) / 0.95;
}

/** Convert an accuracy stop into the engine's signed -1..1 error. */
export function accuracyErrorOf(stopValue: number, window: number): number {
  const rawDelta = (stopValue - ACC_TARGET) / 45;
  const beyond = Math.max(0, Math.abs(rawDelta) - window);
  if (beyond === 0) return 0;
  return Math.sign(rawDelta) * Math.min(1, beyond / (1 - window));
}
