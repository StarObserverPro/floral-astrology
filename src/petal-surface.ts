import type { Morphology } from './morphology.ts';

/** Shared shape contract: the visible shell and its metal rim use this surface. */
export const petalGLSL=/* glsl */`
uniform float uLength,uWidth,uRoundness,uTaper,uCup,uRuffle,uNotch,uThickness,uTwist,uEdge;
uniform float uRuffleFrequency,uRufflePhase,uRuffleSkew,uRuffleEdge;
uniform float uPleatAmplitude,uPleatFrequency,uPleatDirection,uPleatSharpness,uEdgeCurl;
varying vec2 vPetal;
vec3 petalPoint(vec3 p) {
  float t=clamp(p.x,.0001,.9999),s=p.y;
  if(abs(s)>1.5) s=sign(s)*(1.0-uEdge*(abs(s)-2.0));
  float wave=max(.00001,sin(pow(t,uTaper)*3.14159265));
  float x=s*pow(wave,uRoundness)*uWidth;
  float ruffle=sin(t*6.2831853*uRuffleFrequency+s*uRuffleSkew+uRufflePhase)*pow(abs(s),uRuffleEdge)*wave*uRuffle;
  float ridge=sin((s+uPleatDirection*t)*3.14159265*uPleatFrequency+uRufflePhase);
  float pleat=sign(ridge)*pow(abs(ridge),uPleatSharpness)*uPleatAmplitude*wave*(.25+.75*t);
  float curl=uEdgeCurl*pow(abs(s),3.0)*wave*t*t;
  float y=(t*t*uCup+s*s*wave*uCup*.65+ruffle+pleat+curl)*uLength;
  y+=sin(t*3.14159265)*s*uTwist*.24;
  y+=p.z*uThickness*.5*(.65+.35*wave)*sqrt(1.0-s*s*.72);
  float z=t*uLength*(1.0-uNotch*pow(t,8.0)*pow(1.0-abs(s),4.0));
  return vec3(x,y,z);
}
`;

/** CPU sampler for geometric bounds and regression checks, not a second mesh. */
export function petalSurface(m:Morphology,t:number,s:number,side=0):readonly [number,number,number] {
  t=Math.max(.0001,Math.min(.9999,t));
  const wave=Math.max(.00001,Math.sin(t**m.taper*Math.PI));
  const ruffle=Math.sin(t*2*Math.PI*m.ruffleFrequency+s*m.ruffleSkew+m.rufflePhase)*Math.abs(s)**m.ruffleEdge*wave*m.ruffle;
  const ridge=Math.sin((s+m.pleatDirection*t)*Math.PI*m.pleatFrequency+m.rufflePhase);
  const pleat=Math.sign(ridge)*Math.abs(ridge)**m.pleatSharpness*m.pleatAmplitude*wave*(.25+.75*t);
  const curl=m.edgeCurl*Math.abs(s)**3*wave*t*t;
  const y=(t*t*m.cup+s*s*wave*m.cup*.65+ruffle+pleat+curl)*m.length+Math.sin(t*Math.PI)*s*m.twist*.24
    +side*m.thickness*.5*(.65+.35*wave)*Math.sqrt(1-s*s*.72);
  return [s*wave**m.roundness*m.width,y,t*m.length*(1-m.notch*t**8*(1-Math.abs(s))**4)];
}
