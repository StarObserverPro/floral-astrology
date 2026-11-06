import { clamp01, seededRandom } from './math.ts';
import type { FlowerProfile } from './quiz.ts';
import { metalColorGenes } from './morphology.ts';

export const PALETTES = [
  {name:'月白紫晶',hue:265,gem:'#ad91dc'},
  {name:'蔷薇石英',hue:337,gem:'#d695ad'},
  {name:'碧色水晶',hue:161,gem:'#8ecab7'},
  {name:'蜜色琥珀',hue:37,gem:'#dfba79'},
] as const;
export const COLOR_ALGORITHMS = [
  {name:'同色晶谱',id:'tonal'},
  {name:'邻色流光',id:'analogous'},
  {name:'对色幻彩',id:'opalescent'},
] as const;
export function hslHex(h:number,s:number,l:number):string {
  h=((h%360)+360)%360/360;s=clamp01(s);l=clamp01(l);
  const a=s*Math.min(l,1-l);
  const f=(n:number)=>{const k=(n+h*12)%12;return l-a*Math.max(-1,Math.min(k-3,9-k,1));};
  return '#'+[f(0),f(8),f(4)].map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join('');
}
export function generateColors(profile:FlowerProfile,seed:number,palette=0,algorithm=1):{a:string;b:string;metal:string;metalB:string;metalC:string} {
  const r=seededRandom(seed^0x24acfe),p=profile;
  const h=PALETTES[palette]?.hue??265;
  const hue=h+(p.dream-.5)*46+(r()-.5)*24;
  const saturation=.36+p.softness*.25+r()*.08;
  const lightness=.57+p.outward*.12;
  const separation=algorithm===0 ? 3+(p.freedom-.5)*5 : algorithm===1 ? 24+p.freedom*46 : 145+p.freedom*56;
  const m=metalColorGenes(profile,seed),mh=m.metalHue+(h-265)*.32;
  const spread=algorithm===0?m.metalSpread*.18:algorithm===1?m.metalSpread*.6:m.metalSpread+65;
  return {a:hslHex(hue,saturation,lightness),
    b:hslHex(hue+separation,saturation*(algorithm===0?.75:1.1),lightness+(algorithm===2?-.05:.04)),
    metal:hslHex(mh,m.metalChroma,.48+p.outward*.12),
    metalB:hslHex(mh+spread,m.metalChroma*.86,.58+p.softness*.10),
    metalC:hslHex(mh-spread*.65,.05+m.metalChroma*.23,.69+p.freedom*.08)};
}
