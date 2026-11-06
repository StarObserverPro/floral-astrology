import { clamp01, lerp, seededRandom } from './math.ts';
import type { Answer, FlowerProfile } from './quiz.ts';

// Every flower component consumes this bounded, continuous genome. The four
// silhouettes are anchors in one surface, not four interchangeable model files.
const BASE_MORPHOLOGY_LIMITS = {
  layers: [1, 7.5], petals: [4, 16], length: [1.15, 2.2], width: [.38, 1.16],
  roundness: [.25, 1.25], taper: [.6, 1.45], cup: [.015, .5], ruffle: [0, .17],
  notch: [0, .09], opening: [-.4, .18], thickness: [.035, .19],
  layerShrink: [.10, .3], layerRise: [.035, .17], twist: [0, .3], asymmetry: [0, .4],
  edgeWidth: [.028, .075], baseRadius: [.08, .3],
  budPetals: [5, 10], budLength: [1.08, 1.58], budWidth: [.35, .62],
  calyxCount: [3, 12], calyxLength: [.28, .92], calyxWidth: [.10, .36], calyxThickness: [.045, .14],
  stemCount: [1, 4], stemLength: [.35, 1.65], stemRadius: [.025, .083],
  stemBend: [.03, .34], stemSpread: [.02, .25], stemTwist: [.3, 2.8],
  ringCount: [0, 2], ringPattern: [0, 3], ringRadius: [.55, 1.12], ringThickness: [.032, .068],
  ringDepth: [.65, 1.8], ringAspect: [.76, 1.35], ringTilt: [.15, .9], ringSpeed: [.07, .22],
  pendantCount: [0, 4], pendantSize: [.09, .25], pendantAspect: [.8, 2.8],
  stamenCount: [2, 36], stamenLength: [.28, .82], stamenSpread: [.18, .68],
  stamenThickness: [.014, .035], antherSize: [.038, .095], antherAspect: [.7, 2.3],
  coreSize: [.11, .32], coreAspect: [.65, 2.1],
  shardCount: [3, 24], shardRadius: [1.25, 2.05], shardHeight: [.45, 1.55],
  shardSize: [.075, .17], shardAspect: [.85, 3.3], shardOrbit: [.025, .12],
} as const;
const RING_SURFACE_LIMITS={ringSurface:[0,4],ringFacets:[5,12],ringFold:[.16,.62],ringBandWidth:[.11,.29],ringTwists:[1,3],ringSheets:[2,3],ringKnotWinding:[3,5]} as const;
const FOLD_LIMITS={ruffleFrequency:[2.5,8],rufflePhase:[0,Math.PI*2],ruffleSkew:[.6,4.8],ruffleEdge:[1.6,6],pleatAmplitude:[.003,.055],pleatFrequency:[1.5,5],pleatDirection:[-.8,.8],pleatSharpness:[1,2.6],edgeCurl:[-.12,.20]} as const;
const METAL_LIMITS={metalHue:[0,360],metalSpread:[28,160],metalChroma:[.12,.48],metalBalance:[.35,.85],metalPattern:[0,2]} as const;
export const MORPHOLOGY_LIMITS={...BASE_MORPHOLOGY_LIMITS,...RING_SURFACE_LIMITS,...FOLD_LIMITS,...METAL_LIMITS};
export type Morphology = { -readonly [K in keyof typeof MORPHOLOGY_LIMITS]: number };
export const MORPHOLOGY_KEYS = Object.keys(MORPHOLOGY_LIMITS) as (keyof Morphology)[];
export const MAX_LAYERS = 8;
export const MAX_PETALS_PER_LAYER = 16;

const ANCHORS = [
  // peach: broad, five-petal shallow corolla
  { layers: 1, petals: 5, length: 1.7, width: .88, roundness: .40, taper: 1.04, cup: .065, ruffle: .008, notch: .065, opening: .09, thickness: .055, layerShrink: .25 },
  // peony: densely overlapping, ruffled, many-layered corolla
  { layers: 7, petals: 13.5, length: 1.78, width: .67, roundness: .38, taper: 1.12, cup: .21, ruffle: .13, notch: .008, opening: .015, thickness: .075, layerShrink: .115 },
  // magnolia: long, thick, cupped tepals
  { layers: 2, petals: 5, length: 2.08, width: .49, roundness: .85, taper: .84, cup: .36, ruffle: .004, notch: 0, opening: -.32, thickness: .165, layerShrink: .22 },
  // veronica: four unequal, broad, almost planar lobes
  { layers: 1, petals: 4, length: 1.52, width: 1.06, roundness: .36, taper: 1.3, cup: .02, ruffle: .012, notch: .035, opening: .13, thickness: .04, layerShrink: .25 },
] as const;
export const FAMILY_NAMES = ['peach', 'peony', 'magnolia', 'veronica'] as const;

export function familyWeights(profile: FlowerProfile): number[] {
  const accent = (value:number) => { const t=clamp01((value-.35)/.30);return t*t*(3-2*t); };
  const e=accent(profile.outward),n=accent(profile.dream);
  return [e*(1-n), (1-e)*n, (1-e)*(1-n), e*n];
}
export function dominantFamily(profile: FlowerProfile): string {
  const weights = familyWeights(profile);
  return FAMILY_NAMES[weights.indexOf(Math.max(...weights))];
}
export function shapeSeedFromAnswers(answers: readonly Answer[]): number {
  let hash = 2166136261;
  for (const answer of answers) for (const char of answer.questionId+answer.trait) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

export function morphologyFromProfile(profile: FlowerProfile, seed = 20261105): Morphology {
  const weights = familyWeights(profile), random = seededRandom(seed);
  const result = {} as Morphology;
  const e=profile.outward, n=profile.dream, s=profile.softness, f=profile.freedom;
  // Independent streams keep ornamental dimensions free to vary even where
  // there is no claim of a psychological meaning.
  for (const key of Object.keys(BASE_MORPHOLOGY_LIMITS) as (keyof typeof BASE_MORPHOLOGY_LIMITS)[]) {
    const [min,max] = MORPHOLOGY_LIMITS[key];
    result[key] = lerp(min,max,clamp01(random()*.62+e*.10+n*.08+s*.09+f*.11));
  }
  for (const key of Object.keys(ANCHORS[0]) as (keyof typeof ANCHORS[0])[]) {
    const value = ANCHORS.reduce((sum, anchor, i) => sum+anchor[key]*weights[i],0);
    const [min,max] = MORPHOLOGY_LIMITS[key];
    // Counts keep the five/four-petal endpoints; the other dimensions vary
    // substantially within and between the four silhouettes.
    const variation = key === 'layers' || key === 'petals' ? 0 : (random()-.5)*.13+(s-.5)*.09;
    result[key] = Math.max(min,Math.min(max,value*(1+variation)));
  }
  result.ringCount=2*Math.pow(result.ringCount/2,1.45);
  result.twist = .025+f*.19;
  result.asymmetry = weights[3]*.36+weights[1]*f*.12;
  result.stamenCount = Math.max(2, weights[0]*24+weights[1]*32+weights[2]*10+weights[3]*3+(random()-.5)*2);
  for(const key of ['layers','petals','budPetals','calyxCount','stemCount','ringCount','ringPattern','pendantCount','stamenCount','shardCount'] as const) result[key]=Math.round(result[key]);
  const surfaceRandom=seededRandom(seed^0x517cc1b7);
  for(const key of Object.keys(RING_SURFACE_LIMITS) as (keyof typeof RING_SURFACE_LIMITS)[]){
    const [min,max]=RING_SURFACE_LIMITS[key];result[key]=lerp(min,max,surfaceRandom());
  }
  result.ringSurface=Math.round(result.ringSurface);result.ringFacets=Math.round(result.ringFacets);
  result.ringTwists=Math.round(result.ringTwists);result.ringSheets=Math.round(result.ringSheets);
  result.ringKnotWinding=result.ringKnotWinding<4?3:5;
  const folds=seededRandom(seed^0x2d738f29);
  for(const key of Object.keys(FOLD_LIMITS) as (keyof typeof FOLD_LIMITS)[]){
    const [min,max]=FOLD_LIMITS[key];result[key]=lerp(min,max,folds());
  }
  // Dense peonies fold strongly; thick magnolia cups remain comparatively calm.
  result.pleatAmplitude*=.22+weights[1]*.78;
  result.pleatAmplitude=Math.max(FOLD_LIMITS.pleatAmplitude[0],result.pleatAmplitude);
  result.edgeCurl*=.3+weights[1]*.7;
  Object.assign(result,metalColorGenes(profile,seed));
  return result;
}

export function metalColorGenes(profile:FlowerProfile,seed:number):Pick<Morphology,keyof typeof METAL_LIMITS> {
  const r=seededRandom(seed^0x6fc93a21),result={} as Pick<Morphology,keyof typeof METAL_LIMITS>;
  for(const key of Object.keys(METAL_LIMITS) as (keyof typeof METAL_LIMITS)[]){
    const [min,max]=METAL_LIMITS[key];result[key]=lerp(min,max,r());
  }
  result.metalHue=(result.metalHue+profile.dream*34+profile.softness*22)%360;
  result.metalPattern=Math.round(result.metalPattern);
  return result;
}

export function layerPetalCount(m: Morphology, layer: number): number {
  return Math.max(4, m.petals*(1-layer*.035));
}
export function totalPetalCount(m: Morphology): number {
  return Array.from({length:Math.round(m.layers)},(_,i)=>Math.round(layerPetalCount(m,i))).reduce((a,b)=>a+b,0);
}

/** Shared by both renderers. A closed bud is the only corolla before q3. */
export function layerReveal(layer: number, layers: number, reveals: readonly number[]): number {
  if (layer === 0) return reveals[0];
  const phase = Math.min(3, 1+Math.floor((layer-1)/Math.max(1,layers-1)*3));
  return reveals[phase]*clamp01(layers-layer);
}

/** Exact common centre for every asynchronously rotated metal ring. */
export function ringCenter(m: Morphology, growth=1): readonly [number,number,number] {
  return [0, .16-m.stemLength*(.62+.38*growth), 0];
}

/** CPU counterpart of the normalized GPU lamina, used by the flat fallback. */
export function petalOutline(m: Morphology, t: number, s: number): readonly [number,number] {
  const wave = Math.max(0,Math.sin(Math.PI*Math.pow(clamp01(t),m.taper)));
  return [s*Math.pow(wave,m.roundness)*m.width, t*m.length*(1-m.notch*Math.pow(t,8)*Math.pow(1-Math.abs(s),4))];
}
