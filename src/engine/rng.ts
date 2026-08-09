/** Small seeded PRNG so games are reproducible and tests are deterministic. */
export interface Rng {
  next(): number;
  /** Uniform in [min, max). */
  range(min: number, max: number): number;
  /** Roughly normal, mean 0, sd 1. */
  normal(): number;
  /** True with probability p. */
  chance(p: number): boolean;
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    normal: () => {
      // Sum of three uniforms is close enough to normal for our purposes and
      // has bounded tails, which keeps misses from being absurd.
      return (next() + next() + next() - 1.5) * 2;
    },
    chance: (p) => next() < p,
  };
}
