export type BotanicalCurve={cx:number;cy:number;rx:number;ry:number;lobes:number;amplitude:number;phase?:number};

/** One periodic analytic curve, matching both position and tangent at its seam. */
export function botanicalPoint(angle:number,c:BotanicalCurve):{x:number;y:number;dx:number;dy:number} {
  const phase=c.phase??0,r=1+c.amplitude*Math.cos(c.lobes*angle+phase);
  const dr=-c.amplitude*c.lobes*Math.sin(c.lobes*angle+phase),co=Math.cos(angle),si=Math.sin(angle);
  return {x:c.cx+c.rx*r*co,y:c.cy+c.ry*r*si,dx:c.rx*(dr*co-r*si),dy:c.ry*(dr*si+r*co)};
}
export function botanicalPath(c:BotanicalCurve):string {
  const steps=24,step=Math.PI*2/steps,f=(n:number)=>n.toFixed(3),first=botanicalPoint(0,c);
  let path=`M${f(first.x)} ${f(first.y)}`;
  for(let i=0;i<steps;i++){
    const a=botanicalPoint(i*step,c),b=botanicalPoint((i+1)*step,c);
    path+=`C${f(a.x+a.dx*step/3)} ${f(a.y+a.dy*step/3)} ${f(b.x-b.dx*step/3)} ${f(b.y-b.dy*step/3)} ${f(b.x)} ${f(b.y)}`;
  }
  return path+'Z';
}
export function answerArt(index:number):string {
  const d=botanicalPath({cx:50,cy:28,rx:37,ry:17,lobes:index===0?2:3,amplitude:index===0?.16:.12,phase:Math.PI/2});
  return `<svg class="answer-art" viewBox="0 0 100 56" fill="none" aria-hidden="true"><path class="art-core" d="${d}"/></svg>`;
}
export function buttonIcon(icon:string):string {
  const d=botanicalPath({cx:32,cy:32,rx:25,ry:25,lobes:4,amplitude:.075});
  return `<svg class="button-frame" viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="${d}"/></svg>`+icon;
}
export function colorArt(index:number):string {
  const d=botanicalPath({cx:16,cy:16,rx:9,ry:10,lobes:index+1,amplitude:.12,phase:Math.PI/2});
  return `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="${d}"/></svg>`;
}
export function paletteArt():string {
  const d=botanicalPath({cx:16,cy:16,rx:5.5,ry:9,lobes:1,amplitude:.16,phase:Math.PI/2});
  return `<svg class="palette-swatch" viewBox="0 0 32 32" aria-hidden="true"><path d="${d}"/></svg>`;
}
