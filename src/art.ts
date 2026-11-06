export type BotanicalCurve={cx:number;cy:number;rx:number;ry:number;lobes:number;amplitude:number;phase?:number;harmonic?:number};
export type CurvePoint={x:number;y:number;dx:number;dy:number};
export type OrnamentCurve={kind:'descartes'|'lissajous';frequencyX?:number;frequencyY?:number;phase?:number};

/** One periodic analytic curve, matching both position and tangent at its seam. */
export function botanicalPoint(angle:number,c:BotanicalCurve):CurvePoint {
  const phase=c.phase??0,h=c.harmonic??0;
  const r=1+c.amplitude*Math.cos(c.lobes*angle+phase)+h*Math.cos(c.lobes*2*angle-phase);
  const dr=-c.amplitude*c.lobes*Math.sin(c.lobes*angle+phase)-2*c.lobes*h*Math.sin(2*c.lobes*angle-phase),co=Math.cos(angle),si=Math.sin(angle);
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
/** Positive closed loop of x³+y³=3xy, rotated into a leaf. The zero-speed
 * parameter endpoints retain its intentional cusp without a connecting line. */
export function ornamentPoint(angle:number,c:OrnamentCurve):CurvePoint {
  if(c.kind==='lissajous'){
    const a=c.frequencyX??3,b=c.frequencyY??2,p=c.phase??Math.PI/2;
    return {x:Math.sin(a*angle+p),y:Math.sin(b*angle),dx:a*Math.cos(a*angle+p),dy:b*Math.cos(b*angle)};
  }
  const u=angle/(Math.PI*2),theta=Math.PI/2*u*u*(3-2*u),speed=1.5*u*(1-u);
  const s=Math.sin(theta),co=Math.cos(theta),den=co**3+s**3,dDen=3*co*s*(s-co);
  const nx=3*s*co*co,ny=3*s*s*co;
  const dx=((3*co**3-6*s*s*co)*den-nx*dDen)/(den*den)*speed;
  const dy=((6*s*co*co-3*s**3)*den-ny*dDen)/(den*den)*speed;
  return {x:(nx-ny)/den,y:(nx+ny)/den*2/3-1,dx:dx-dy,dy:(dx+dy)*2/3};
}

export function ornamentPath(c:OrnamentCurve,cx=50,cy=28,rx=39,ry=20):string {
  const steps=96,step=Math.PI*2/steps,points=Array.from({length:steps+1},(_,i)=>ornamentPoint(i*step,c));
  const xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const sx=rx*2/(maxX-minX),sy=ry*2/(maxY-minY),mx=(maxX+minX)/2,my=(maxY+minY)/2;
  const p=points.map(v=>({x:cx+(v.x-mx)*sx,y:cy+(v.y-my)*sy,dx:v.dx*sx,dy:v.dy*sy})),f=(v:number)=>v.toFixed(3);
  let path=`M${f(p[0].x)} ${f(p[0].y)}`;
  for(let i=0;i<steps;i++){
    const a=p[i],b=p[i+1];path+=`C${f(a.x+a.dx*step/3)} ${f(a.y+a.dy*step/3)} ${f(b.x-b.dx*step/3)} ${f(b.y-b.dy*step/3)} ${f(b.x)} ${f(b.y)}`;
  }
  return path+'Z';
}

export function answerArt(index:number,question=0):string {
  const variants:OrnamentCurve[]=[{kind:'descartes'},{kind:'lissajous',frequencyX:3,frequencyY:2},{kind:'lissajous',frequencyX:2,frequencyY:3,phase:Math.PI/3},{kind:'lissajous',frequencyX:4,frequencyY:3}];
  const curve=variants[(question+index)%variants.length],d=ornamentPath(curve);
  return `<svg class="answer-art" data-curve="${curve.kind}" viewBox="0 0 100 56" fill="none" aria-hidden="true"><path class="art-core" fill-rule="evenodd" d="${d}"/></svg>`;
}
export function buttonIcon(icon:string):string {
  const d=botanicalPath({cx:32,cy:32,rx:25,ry:25,lobes:4,amplitude:.10,harmonic:.045});
  return `<svg class="button-frame" viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="${d}"/></svg>`+icon;
}
export function colorArt(index:number):string {
  const d=ornamentPath(index===0?{kind:'descartes'}:{kind:'lissajous',frequencyX:index+1,frequencyY:index+2},16,16,9,10);
  return `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="${d}"/></svg>`;
}
export function paletteArt():string {
  const d=botanicalPath({cx:16,cy:16,rx:5.5,ry:9,lobes:1,amplitude:.16,phase:Math.PI/2});
  return `<svg class="palette-swatch" viewBox="0 0 32 32" aria-hidden="true"><path d="${d}"/></svg>`;
}
