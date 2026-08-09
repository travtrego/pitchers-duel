import { describe, expect, it } from 'vitest';
import {
  ACC_TARGET,
  MAX_DT,
  accuracyErrorOf,
  accuracyWindow,
  frameDelta,
  meterSpeed,
  powerErrorOf,
  stepAccuracy,
  stepPower,
} from './meterMath';

describe('frame timing', () => {
  it('never returns a negative delta when the frame timestamp predates the loop start', () => {
    // requestAnimationFrame hands back the frame's start time, which can be
    // earlier than the performance.now() captured when scheduling it.
    expect(frameDelta(1000, 1016)).toBe(0);
  });

  it('clamps a long stall so a backgrounded tab cannot teleport the bar', () => {
    expect(frameDelta(9000, 1000)).toBe(MAX_DT);
  });

  it('passes normal frames through unchanged', () => {
    expect(frameDelta(1016, 1000)).toBeCloseTo(0.016);
  });
});

describe('power stop', () => {
  const speed = meterSpeed(0.18, 1);

  it('does not auto-release on a degenerate first frame', () => {
    // The bug this guards: dt of 0 at value 0 read as "bottomed out" and fired
    // the pitch off with no power before the player ever saw the bar move.
    const step = stepPower(0, 1, speed, 0);
    expect(step.bottomedOut).toBe(false);
    expect(step.value).toBe(0);
    expect(step.direction).toBe(1);
  });

  it('climbs while rising', () => {
    const step = stepPower(0, 1, speed, 0.016);
    expect(step.value).toBeGreaterThan(0);
    expect(step.direction).toBe(1);
  });

  it('turns over at the top instead of overshooting', () => {
    const step = stepPower(99, 1, speed, 0.05);
    expect(step.value).toBe(100);
    expect(step.direction).toBe(-1);
  });

  it('bottoms out only once it is falling', () => {
    expect(stepPower(0.5, -1, speed, 0.05).bottomedOut).toBe(true);
    expect(stepPower(0.5, 1, speed, 0.05).bottomedOut).toBe(false);
  });

  it('completes a full rise and fall in a plausible number of frames', () => {
    let value = 0;
    let direction: 1 | -1 = 1;
    let frames = 0;
    let peaked = false;
    while (frames++ < 500) {
      const step = stepPower(value, direction, speed, 0.016);
      value = step.value;
      direction = step.direction;
      if (direction === -1) peaked = true;
      if (step.bottomedOut) break;
    }
    expect(peaked).toBe(true);
    // Roughly 0.64s up and 0.64s back down at ~60fps.
    expect(frames).toBeGreaterThan(50);
    expect(frames).toBeLessThan(200);
  });
});

describe('accuracy stop', () => {
  it('falls toward the line and bottoms out', () => {
    const speed = meterSpeed(0.5, 1);
    expect(stepAccuracy(50, speed, 0.016).value).toBeLessThan(50);
    expect(stepAccuracy(0.5, speed, 0.05).bottomedOut).toBe(true);
  });
});

describe('meter difficulty', () => {
  it('sweeps faster for a harder pitch and for a tired arm', () => {
    expect(meterSpeed(0.5, 1)).toBeGreaterThan(meterSpeed(0.18, 1));
    expect(meterSpeed(0.18, 0.3)).toBeGreaterThan(meterSpeed(0.18, 1));
  });

  it('narrows the accuracy window as the arm tires', () => {
    expect(accuracyWindow(0.13, 0.3)).toBeLessThan(accuracyWindow(0.13, 1));
  });
});

describe('meter output', () => {
  it('treats a stop at the top as full power', () => {
    expect(powerErrorOf(100)).toBe(0);
    expect(powerErrorOf(96)).toBe(0);
  });

  it('scales shortfall toward one as the stop drops', () => {
    expect(powerErrorOf(50)).toBeGreaterThan(0.4);
    expect(powerErrorOf(null)).toBe(1);
  });

  it('gives zero error inside the forgiving window', () => {
    expect(accuracyErrorOf(ACC_TARGET, 0.1)).toBe(0);
    expect(accuracyErrorOf(ACC_TARGET + 3, 0.1)).toBe(0);
  });

  it('signs the error by which side of the line you stopped on', () => {
    expect(accuracyErrorOf(ACC_TARGET + 30, 0.1)).toBeGreaterThan(0);
    expect(accuracyErrorOf(ACC_TARGET - 15, 0.1)).toBeLessThan(0);
  });

  it('never exceeds full error', () => {
    expect(Math.abs(accuracyErrorOf(100, 0.05))).toBeLessThanOrEqual(1);
    expect(Math.abs(accuracyErrorOf(0, 0.05))).toBeLessThanOrEqual(1);
  });
});
