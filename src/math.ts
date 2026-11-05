export const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Frame-rate independent exponential approach: about 60% in two seconds. */
export function approach(current: number, target: number, seconds: number, tau = 2.2): number {
  if (Math.abs(target - current) < 0.00002) return target;
  return lerp(current, target, 1 - Math.exp(-Math.max(0, seconds) / tau));
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

/** Adapted from Crystal Garden's widthProfileAt, using the same five stations.
 * Source: StarObserverPro/crystal-garden, plant-geometry-v31-runtime.ts.
 * The full plant/world runtime is deliberately outside this standalone renderer.
 */
export function widthProfileAt(profile: readonly number[], input: number): number {
  const scaled = clamp01(input) * (profile.length - 1);
  const index = Math.min(profile.length - 2, Math.floor(scaled));
  return lerp(profile[index], profile[index + 1], scaled - index);
}
