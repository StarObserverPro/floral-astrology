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

/** Opening, topology and size have different clocks. Q3 must not spend all size. */
export function petalMaturity(progress:number):number {
  const t=clamp01(progress);
  return .2+.8*t*t*(3-2*t);
}

export function flowerAppearance(seconds:number,reduced=false):number {
  if(reduced)return 1;
  const t=clamp01((seconds-.15)/2.3);
  return t*t*(3-2*t);
}
