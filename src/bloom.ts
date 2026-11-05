import { clamp01 } from './math.ts';

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
