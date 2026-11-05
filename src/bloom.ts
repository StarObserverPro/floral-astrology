import { clamp01, lerp } from './math.ts';

export const BLOOM_MILESTONES = [3, 6, 9, 12] as const;
export const BLOOM_STAGE_NAMES = ['bud', 'corolla', 'inner-petals', 'heart', 'crystal-crown'] as const;

export function bloomStage(progress: number): number {
  const answered = Math.floor(clamp01(progress) * 12 + 1e-6);
  return BLOOM_MILESTONES.filter(milestone => answered >= milestone).length;
}

export function revealTargets(progress: number): number[] {
  const stage = bloomStage(progress);
  return BLOOM_MILESTONES.map((_, index) => stage > index ? 1 : 0);
}

export function petalScale(layer: number, growth: number, reveal: number): number {
  return layer === 0 ? .42 + .52*reveal + .06*growth : lerp(.008, 1, reveal);
}

export function petalOpening(layer: number, outward: number, reveal: number): number {
  return lerp(-1.38 + layer*.08, -.28 + layer*.13 - (1-outward)*.42, reveal);
}
