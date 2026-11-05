import { PALETTES } from './flower.ts';
import { approach, lerp, seededRandom, widthProfileAt } from './math.ts';
import { BLOOM_STAGE_NAMES, bloomStage, petalOpening, petalScale, revealTargets } from './bloom.ts';
import { FlowerRotation } from './rotation.ts';
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
  private reveals = [0, 0, 0, 0];
  private revealTargets = [0, 0, 0, 0];
  private unlockedStage = 0;
  private rotation: FlowerRotation;
  private dawn = 0;
  private dawnTarget = 0;
  private palette = 0;
  private hue = 266;
  private targetHue = 266;
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
    this.canvas.setAttribute('data-flower', '');
    this.canvas.dataset.renderer = 'canvas2d';
    container.replaceChildren(this.canvas);
    this.rotation = new FlowerRotation(this.canvas);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(container);
    this.resize();
    document.addEventListener('visibilitychange', this.visibility);
    this.frame = requestAnimationFrame(this.tick);
  }

  private resize = (): void => {
    const rect = this.container.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2.5);
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
    this.unlockedStage = reset ? bloomStage(progress) : Math.max(this.unlockedStage, bloomStage(progress));
    this.revealTargets = revealTargets(this.unlockedStage/4);
    this.canvas.dataset.bloomStage = BLOOM_STAGE_NAMES[this.unlockedStage];
  }
  setTheme(theme: 'dawn' | 'night', immediate = false): void {
    this.dawnTarget = theme === 'dawn' ? 1 : 0;
    if (immediate) this.dawn = this.dawnTarget;
  }
  setPalette(index: number): void {
    if (!PALETTES[index]) return;
    this.palette = index;
    const hue = [266,337,163,37][index];
    this.targetHue = this.hue + ((hue-this.hue+540)%360)-180;
  }
  resetView(): void { this.rotation.reset(); }

  snapshot(width: number, height: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The photo canvas is unavailable.');
    this.draw(context, width, height, true);
    return canvas;
  }
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
    for (let i=0;i<this.reveals.length;i++) this.reveals[i] = approach(this.reveals[i],this.revealTargets[i],dt,this.reduced ? .15 : 1.65);
    this.rotation.update(dt,this.reduced);
    this.dawn = approach(this.dawn, this.dawnTarget, dt, .65);
    this.hue = approach(this.hue, this.targetHue, dt, .42);
    this.draw();
    document.documentElement.dataset.rendered = 'true';
    (window as unknown as Record<string, unknown>).__VISUAL_READY__ = true;
    this.frame = requestAnimationFrame(this.tick);
  };

  private draw(c = this.ctx, w = this.width, h = this.height, photo = false): void {
    const d = this.dawn;
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
    const unit = photo ? Math.min(w*.215, h*.145) : Math.min(w*.18, h*.105, 132);
    c.save(); c.translate(w/2, h*(photo ? .55 : .56)+Math.sin(this.time*.65)*unit*.013);
    const view = this.rotation.state;
    const cy = Math.cos(view.yaw), sy = Math.sin(view.yaw), cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
    const cr = Math.cos(view.roll), sr = Math.sin(view.roll);
    const project = (x: number, y: number, z: number): [number, number] => {
      const px = x*cy+z*sy, rz = z*cy-x*sy;
      const py = y*cp-rz*sp, pz = y*sp+rz*cp;
      return [(px*cr-py*sr)*unit, (-(px*sr+py*cr)*.85+pz*.53)*unit];
    };
    const path = (points: [number,number][]) => {
      c.beginPath(); points.forEach((p,i) => i ? c.lineTo(p[0],p[1]) : c.moveTo(p[0],p[1])); c.closePath();
    };
    c.strokeStyle = `rgba(${d>.5?'133,106,63':'178,153,111'},.28)`;
    c.lineWidth = .65;
    const worldRing = (radius: number, y: number, z: number, tilt = 0, phase = 0) => {
      c.beginPath();
      for (let j=0;j<=100;j++) {
        const a=j/100*Math.PI*2+phase;
        const p=project(Math.cos(a)*radius,y+Math.sin(a)*radius*Math.sin(tilt),z+Math.sin(a)*radius*Math.cos(tilt));
        if (j) c.lineTo(...p); else c.moveTo(...p);
      }
      c.stroke();
    };
    for (let k = 0; k < 2; k++) worldRing(2.48+k*.12,.2,-1.1,.34+Math.sin(this.time*(.07+k*.02)+k)*.12);
    for (let i = 0; i < 12; i++) {
      const a = i/12*Math.PI*2+this.time*.012;
      const [x,y] = project(Math.cos(a)*2.6,.2+Math.sin(a)*.84,Math.sin(a)*2.3-1.1);
      path([[x,y-3],[x+1.7,y],[x,y+3],[x-1.7,y]]); c.fillStyle = 'rgba(189,166,126,.45)'; c.fill();
    }
    const metal = c.createLinearGradient(-unit,0,unit,unit);
    metal.addColorStop(0,'#6e5e46'); metal.addColorStop(.35,'#dcc797'); metal.addColorStop(.53,'#bba174'); metal.addColorStop(.7,'#e2cfaa'); metal.addColorStop(1,'#7d694d');
    c.strokeStyle = metal; c.lineWidth = unit*.027;
    const base=project(0,.1,0), stemA=project(-.09,-.4,.02), stemB=project(.12,-.95,-.05), stemEnd=project(0,-1.48,0);
    c.beginPath(); c.moveTo(...base); c.bezierCurveTo(...stemA,...stemB,...stemEnd); c.stroke();
    c.lineWidth = 1;
    for (let k = 0; k < 3; k++) worldRing(.52+k*.2,-1.43+k*.045,0,Math.sin(this.time*.22)*.035);
    path([project(0,-1.42,0),project(.1,-1.62,0),project(0,-1.83,0),project(-.1,-1.62,0)]); c.fillStyle = metal; c.fill();
    const counts = [11,10,8,6], petals: { layer:number; i:number; a:number; depth:number }[] = [];
    counts.forEach((n,layer) => {
      if (layer > 0 && this.reveals[layer] < .025) return;
      for (let i=0;i<n;i++) { const a=i/n*6.28+layer*.41; petals.push({layer,i,a,depth:Math.cos(a+view.yaw)*(2.1-layer*.32)}); }
    });
    petals.sort((a,b) => a.depth-b.depth);
    const hue = this.hue, p = this.current;
    for (const petal of petals) {
      const {layer,a,i} = petal;
      const reveal = this.reveals[layer];
      const size = petalScale(layer,this.growth,reveal);
      const length = (2.1-layer*.32)*size;
      const width = .73-layer*.1;
      const angle = petalOpening(layer,p.outward,reveal);
      const point = (t:number,s:number): [number,number] => {
        const wave=Math.sin(t*Math.PI);
        const profile=lerp(widthProfileAt([.035,.66,1,.76,.012],t), Math.max(0,wave)**.65*(1-.18*t),p.softness*.88);
        const x=s*profile*width*size;
        const y=(t*t*.36+s*s*wave*.32)*length;
        const z=t*length;
        const rotatedY=y*Math.cos(angle)-z*Math.sin(angle)+.24+layer*.13;
        const rotatedZ=y*Math.sin(angle)+z*Math.cos(angle)+.13+p.dream*.1*reveal;
        return project(x*Math.cos(a)+rotatedZ*Math.sin(a),rotatedY,rotatedZ*Math.cos(a)-x*Math.sin(a));
      };
      const left = Array.from({length:17},(_,j)=>point(j/16,-1));
      const right = Array.from({length:17},(_,j)=>point(1-j/16,1));
      path([...left,...right]);
      const base = point(0,0), tip = point(1,0), gradient=c.createLinearGradient(base[0],base[1],tip[0],tip[1]);
      gradient.addColorStop(0,`hsla(${hue-18},26%,${d>.5?49:38}%,.84)`);
      gradient.addColorStop(.30,`hsla(${hue},39%,${d>.5?75:70}%,.70)`);
      gradient.addColorStop(.49,`hsla(${hue+10},24%,94%,.86)`);
      gradient.addColorStop(.56,`hsla(${hue+12*p.dream},47%,${d>.5?85:79}%,.64)`);
      gradient.addColorStop(1,`hsla(${hue-26*p.dream},28%,${d>.5?69:72}%,.86)`);
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
    if (this.reveals[2] > .025) {
      const reveal=this.reveals[2], center=project(0,.65,0);
      const glow=c.createRadialGradient(...center,0,...center,unit*.4);
      glow.addColorStop(0,`rgba(255,235,195,${.25*reveal})`); glow.addColorStop(1,'rgba(255,235,195,0)');
      c.fillStyle=glow; c.beginPath();c.arc(...center,unit*.4,0,Math.PI*2);c.fill();
      c.strokeStyle=metal;c.lineWidth=.65;
      for(let i=0;i<12;i++) {
        const a=i/12*Math.PI*2;
        const tip=project(Math.cos(a)*.37*reveal,.60+(i%3)*.035,Math.sin(a)*.37*reveal);
        c.beginPath();c.moveTo(...center);c.lineTo(...tip);c.stroke();
        path([[tip[0],tip[1]-3*reveal],[tip[0]+2*reveal,tip[1]],[tip[0],tip[1]+3*reveal],[tip[0]-2*reveal,tip[1]]]);c.fillStyle=metal;c.fill();
      }
    }
    for(let i=0;i<14;i++) {
      const reveal=this.reveals[i<6?1:3]; if(reveal<.025) continue;
      const angle=i/14*Math.PI*2+this.time*(i%2?1:-1)*(.045+(i%3)*.011);
      const radius=(i<6?1.75+(i%3)*.11:2.04+(i%3)*.08)+p.dream*.12;
      const [x,y]=project(Math.cos(angle)*radius,.25+(i%4)*.28+Math.sin(this.time*.48+i*2.399963)*.12,Math.sin(angle)*radius);
      const r=unit*.045*reveal;
      path([[x,y-r*2.3],[x+r,y],[x,y+r*2.3],[x-r,y]]);
      const shard=c.createLinearGradient(x-r,y,x+r,y);
      shard.addColorStop(0,`hsla(${hue},35%,65%,.65)`); shard.addColorStop(.5,'rgba(255,245,226,.85)');shard.addColorStop(1,`hsla(${hue+18},30%,75%,.6)`);
      c.fillStyle=shard;c.fill();c.strokeStyle=metal;c.lineWidth=.65;c.stroke();
    }
    c.restore();
  }

  dispose(): void {
    this.disposed = true; cancelAnimationFrame(this.frame); this.observer.disconnect();
    this.rotation.dispose();
    document.removeEventListener('visibilitychange', this.visibility); this.canvas.remove();
  }
}
