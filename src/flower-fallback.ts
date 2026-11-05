import { PALETTES } from './flower.ts';
import { approach, lerp, seededRandom, smooth, widthProfileAt } from './math.ts';
import type { FlowerProfile } from './quiz.ts';

// Only used when the browser cannot create a WebGL context. The normal path is
// the physical 3D renderer; this keeps the same answer-driven flower on screen.
export class FlowerFallback {
  private canvas = document.createElement('canvas');
  private ctx: CanvasRenderingContext2D;
  private observer: ResizeObserver;
  private width = 1;
  private height = 1;
  private current: FlowerProfile = { outward: .5, dream: .5, softness: .5, freedom: .5 };
  private target = { ...this.current };
  private growth = .13;
  private growthTarget = .18;
  private dawn = 0;
  private dawnTarget = 0;
  private palette = 0;
  private time = 0;
  private last = 0;
  private frame = 0;
  private disposed = false;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  private random = seededRandom(271828);
  private motes = Array.from({ length: 80 }, () => ({
    x: this.random(), y: this.random(), r: this.random(), phase: this.random()*6.28,
  }));

  constructor(private container: HTMLElement) {
    this.ctx = this.canvas.getContext('2d')!;
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', '随回答逐渐绽放的水晶花');
    container.replaceChildren(this.canvas);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(container);
    this.resize();
    document.addEventListener('visibilitychange', this.visibility);
    this.frame = requestAnimationFrame(this.tick);
  }

  private resize = (): void => {
    const rect = this.container.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    this.width = rect.width; this.height = rect.height;
    this.canvas.width = Math.round(rect.width*dpr); this.canvas.height = Math.round(rect.height*dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  private visibility = (): void => {
    if (document.hidden) cancelAnimationFrame(this.frame);
    else if (!this.disposed) { this.last = 0; this.frame = requestAnimationFrame(this.tick); }
  };

  setProfile(profile: FlowerProfile, progress: number, reset = false): void {
    this.target = { ...profile };
    this.growthTarget = reset ? .18+progress*.82 : Math.max(this.growthTarget, .18+progress*.82);
  }
  setTheme(theme: 'dawn' | 'night', immediate = false): void {
    this.dawnTarget = theme === 'dawn' ? 1 : 0;
    if (immediate) this.dawn = this.dawnTarget;
  }
  setPalette(index: number): void { if (PALETTES[index]) this.palette = index; }
  diagnostics(): Record<string, unknown> {
    return { webgl: false, rendering: 'canvas2d-fallback', growth: this.growth,
      targetGrowth: this.growthTarget, profile: { ...this.current }, contextLost: false };
  }

  private tick = (now: number): void => {
    if (this.disposed || document.hidden) return;
    const dt = this.last ? Math.min((now-this.last)/1000, .07) : 1/60;
    this.last = now;
    if (!this.reduced) this.time += dt;
    for (const key of Object.keys(this.current) as (keyof FlowerProfile)[]) this.current[key] = approach(this.current[key], this.target[key], dt, this.reduced ? .15 : 2.2);
    this.growth = approach(this.growth, this.growthTarget, dt, this.reduced ? .15 : 2.2);
    this.dawn = approach(this.dawn, this.dawnTarget, dt, .65);
    this.draw();
    document.documentElement.dataset.rendered = 'true';
    (window as unknown as Record<string, unknown>).__VISUAL_READY__ = true;
    this.frame = requestAnimationFrame(this.tick);
  };

  private draw(): void {
    const c = this.ctx, w = this.width, h = this.height, d = this.dawn;
    const bg = c.createLinearGradient(0, 0, 0, h);
    const mixColor = (night: number[], day: number[]) => `rgb(${night.map((v, i) => Math.round(lerp(v, day[i], d))).join(',')})`;
    bg.addColorStop(0, mixColor([22,23,44], [235,224,207]));
    bg.addColorStop(.6, mixColor([30,28,48], [235,227,214]));
    bg.addColorStop(1, mixColor([14,18,32], [207,203,191]));
    c.fillStyle = bg; c.fillRect(0,0,w,h);
    const light = c.createRadialGradient(w*.52,h*.47,0,w*.52,h*.47,Math.max(w,h)*.46);
    light.addColorStop(0, `rgba(146,100,158,${.15*(1-d)})`);
    light.addColorStop(1, 'rgba(100,100,100,0)'); c.fillStyle = light; c.fillRect(0,0,w,h);
    if (d > .01) {
      c.save(); c.globalAlpha = d*.065;
      for (let i = 0; i < 7; i++) {
        c.beginPath(); c.moveTo(w*.93,-h*.25); c.lineTo(w*(-.7+i*.28),h); c.lineTo(w*(-.55+i*.28),h);
        c.fillStyle = '#fff4da'; c.fill();
      }
      c.restore();
    }
    for (const mote of this.motes) {
      const x = mote.x*w+Math.sin(this.time*.11+mote.phase)*7;
      const y = mote.y*h+Math.cos(this.time*.13+mote.phase)*8;
      const r = .5+mote.r*mote.r*2.5;
      c.beginPath(); c.arc(x,y,r,0,Math.PI*2);
      c.fillStyle = `rgba(${d>.5?'173,143,93':'225,217,247'},${(.15+.25*Math.sin(this.time*.6+mote.phase)**2)*(1-d*.5)})`; c.fill();
    }
    const unit = Math.min(w*.18, h*.105, 132);
    c.save(); c.translate(w/2, h*.56+Math.sin(this.time*.65)*1.5);
    const project = (x: number, y: number, z: number): [number, number] => [x*unit, (-y*.85+z*.53)*unit];
    const path = (points: [number,number][]) => {
      c.beginPath(); points.forEach((p,i) => i ? c.lineTo(p[0],p[1]) : c.moveTo(p[0],p[1])); c.closePath();
    };
    c.strokeStyle = `rgba(${d>.5?'133,106,63':'178,153,111'},.28)`;
    c.lineWidth = .65;
    for (let k = 0; k < 2; k++) {
      c.beginPath(); c.ellipse(0,-unit*.17,unit*(2.48+k*.12),unit*(1.46+k*.08),-.13,0,6.28); c.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const a = i/12*Math.PI*2, x = Math.cos(a)*2.6*unit, y = Math.sin(a)*1.53*unit-unit*.17;
      path([[x,y-3],[x+1.7,y],[x,y+3],[x-1.7,y]]); c.fillStyle = 'rgba(189,166,126,.45)'; c.fill();
    }
    const metal = c.createLinearGradient(-unit,0,unit,unit);
    metal.addColorStop(0,'#6e5e46'); metal.addColorStop(.35,'#dcc797'); metal.addColorStop(.53,'#bba174'); metal.addColorStop(.7,'#e2cfaa'); metal.addColorStop(1,'#7d694d');
    c.strokeStyle = metal; c.lineWidth = unit*.027;
    c.beginPath(); c.moveTo(0,unit*.05); c.bezierCurveTo(-unit*.18,unit*.45,unit*.15,unit*.9,0,unit*1.28); c.stroke();
    c.lineWidth = 1;
    for (let k = 0; k < 3; k++) { c.beginPath(); c.ellipse(0,unit*1.29,unit*(.52+k*.2),unit*(.14+k*.06),-.06,0,6.28); c.stroke(); }
    path([[0,unit*1.28],[unit*.1,unit*1.45],[0,unit*1.65],[-unit*.1,unit*1.45]]); c.fillStyle = metal; c.fill();
    const counts = [11,10,8,6], petals: { layer:number; i:number; a:number; depth:number }[] = [];
    counts.forEach((n,layer) => { for (let i=0;i<n;i++) { const a=i/n*6.28+layer*.41; petals.push({layer,i,a,depth:Math.cos(a)*(2.1-layer*.32)}); }});
    petals.sort((a,b) => a.depth-b.depth);
    const hues = [266,337,163,37];
    const hue = hues[this.palette], p = this.current;
    for (const petal of petals) {
      const {layer,a,i} = petal;
      const maturity = smooth(layer*.13,.58+layer*.13,this.growth);
      const length = (2.1-layer*.32)*lerp(.26+layer*.03,1,maturity);
      const width = .73-layer*.1;
      const angle = lerp(-1.38+layer*.10,-.22+layer*.17-(1-p.outward)*.44,maturity);
      const point = (t:number,s:number): [number,number] => {
        const wave=Math.sin(t*Math.PI);
        const profile=lerp(widthProfileAt([.035,.66,1,.76,.012],t), Math.max(0,wave)**.65*(1-.18*t),p.softness*.88);
        const x=s*profile*width*lerp(.26+layer*.03,1,maturity);
        const y=(t*t*.36+s*s*wave*.32)*length;
        const z=t*length;
        const rotatedY=y*Math.cos(angle)-z*Math.sin(angle)+.24+layer*.13;
        const rotatedZ=y*Math.sin(angle)+z*Math.cos(angle)+.13+p.dream*.1*maturity;
        return project(x*Math.cos(a)+rotatedZ*Math.sin(a),rotatedY,rotatedZ*Math.cos(a)-x*Math.sin(a));
      };
      const left = Array.from({length:17},(_,j)=>point(j/16,-1));
      const right = Array.from({length:17},(_,j)=>point(1-j/16,1));
      path([...left,...right]);
      const base = point(0,0), tip = point(1,0), gradient=c.createLinearGradient(base[0],base[1],tip[0],tip[1]);
      gradient.addColorStop(0,`hsla(${hue-18},26%,${d>.5?49:38}%,.96)`);
      gradient.addColorStop(.32,`hsla(${hue},39%,${d>.5?75:70}%,.91)`);
      gradient.addColorStop(.65,`hsla(${hue+12*p.dream},47%,${d>.5?88:83}%,.85)`);
      gradient.addColorStop(1,`hsla(${hue-26*p.dream},28%,${d>.5?69:72}%,.94)`);
      c.fillStyle=gradient; c.fill(); c.strokeStyle=metal; c.lineWidth=.8; c.stroke();
      const spine=point(.52,0);
      path([base,point(.5,-1),spine,tip]); c.fillStyle=`rgba(255,239,218,${.08+(1-p.softness)*.13})`; c.fill();
      path([base,spine,point(.5,1),tip]); c.fillStyle='rgba(68,40,95,.085)'; c.fill();
      c.beginPath(); c.moveTo(base[0],base[1]); c.quadraticCurveTo(spine[0],spine[1],tip[0],tip[1]);
      c.lineWidth=.4; c.strokeStyle='rgba(244,228,207,.30)'; c.stroke();
      if (i===0 && layer===3) {
        const center=project(0,.68,0);
        const glow=c.createRadialGradient(center[0],center[1],0,center[0],center[1],unit*.3);
        glow.addColorStop(0,'rgba(255,233,178,.28)'); glow.addColorStop(1,'rgba(255,233,178,0)');
        c.fillStyle=glow;c.beginPath();c.arc(center[0],center[1],unit*.3,0,6.28);c.fill();
      }
    }
    c.restore();
  }

  dispose(): void {
    this.disposed = true; cancelAnimationFrame(this.frame); this.observer.disconnect();
    document.removeEventListener('visibilitychange', this.visibility); this.canvas.remove();
  }
}
