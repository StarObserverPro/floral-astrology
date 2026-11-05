import { PALETTES, COLOR_ALGORITHMS, generateColors } from './color.ts';
import { approach, clamp01, lerp } from './math.ts';
import { BLOOM_STAGE_NAMES, bloomStage, revealTargets, petalMaturity, flowerAppearance } from './bloom.ts';
import { FlowerRotation } from './rotation.ts';
import { MORPHOLOGY_KEYS, dominantFamily, layerPetalCount, layerReveal, morphologyFromProfile, petalOutline } from './morphology.ts';
import type { FlowerProfile } from './quiz.ts';

// A deliberately flat graphic when WebGL is unavailable. No painted bevels,
// perspective projection, simulated reflections, or faux crystal highlights.
export class FlowerFallback {
  private canvas=document.createElement('canvas');
  private ctx:CanvasRenderingContext2D;
  private observer:ResizeObserver;
  private width=1;
  private height=1;
  private current:FlowerProfile={outward:.5,dream:.5,softness:.5,freedom:.5};
  private target={...this.current};
  private genes=morphologyFromProfile(this.current);
  private targetGenes={...this.genes};
  private growth=0;
  private growthTarget=0;
  private reveals=[0,0,0,0];
  private revealTargets=[0,0,0,0];
  private unlockedStage=0;
  private rotation:FlowerRotation;
  private dawn=0;
  private dawnTarget=0;
  private palette=0;
  private colorAlgorithm=1;
  private seed=20261105;
  private appearanceAge=0;
  private time=0;
  private last=0;
  private frame=0;
  private disposed=false;
  private reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private container:HTMLElement) {
    this.ctx=this.canvas.getContext('2d')!;
    this.canvas.setAttribute('role','img');this.canvas.setAttribute('data-flower','');
    this.canvas.dataset.renderer='canvas2d';container.replaceChildren(this.canvas);
    this.rotation=new FlowerRotation(this.canvas);
    this.observer=new ResizeObserver(this.resize);this.observer.observe(container);this.resize();
    document.addEventListener('visibilitychange',this.visibility);this.frame=requestAnimationFrame(this.tick);
  }
  private resize=():void=>{
    const rect=this.container.getBoundingClientRect(),dpr=Math.min(2.75,Math.max(1.6,devicePixelRatio||1));
    this.width=rect.width;this.height=rect.height;this.canvas.width=Math.round(rect.width*dpr);this.canvas.height=Math.round(rect.height*dpr);
    this.ctx.setTransform(dpr,0,0,dpr,0,0);
  };
  private visibility=():void=>{
    if(document.hidden)cancelAnimationFrame(this.frame);
    else if(!this.disposed){this.last=0;this.frame=requestAnimationFrame(this.tick);}
  };
  setProfile(profile:FlowerProfile,progress:number,reset=false,seed=20261105):void {
    this.target={...profile};this.seed=seed;
    if(reset){this.appearanceAge=0;this.growth=0;this.reveals=[0,0,0,0];}this.targetGenes=morphologyFromProfile(profile,seed);
    this.growthTarget=reset?progress:Math.max(this.growthTarget,progress);
    this.unlockedStage=reset?bloomStage(progress):Math.max(this.unlockedStage,bloomStage(progress));
    this.revealTargets=revealTargets(this.unlockedStage/4);
    this.canvas.dataset.bloomStage=BLOOM_STAGE_NAMES[this.unlockedStage];this.canvas.dataset.silhouette=dominantFamily(profile);
  }
  setTheme(theme:'dawn'|'night',immediate=false):void {this.dawnTarget=theme==='dawn'?1:0;if(immediate)this.dawn=this.dawnTarget;}
  setPalette(index:number):void {if(PALETTES[index])this.palette=index;}
  setColorAlgorithm(index:number):void {if(COLOR_ALGORITHMS[index])this.colorAlgorithm=index;}
  resetView():void {this.rotation.reset();}
  snapshot(width:number,height:number):HTMLCanvasElement {
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d');if(!context)throw new Error('The photo canvas is unavailable.');
    this.draw(context,width,height,true);return canvas;
  }
  diagnostics():Record<string,unknown> {
    return {webgl:false,rendering:'flat-canvas-fallback',growth:this.growth,targetGrowth:this.growthTarget,profile:{...this.current},morphology:{...this.genes},contextLost:false};
  }
  private tick=(now:number):void=>{
    if(this.disposed||document.hidden)return;
    const dt=this.last?Math.min((now-this.last)/1000,.25):1/60;this.last=now;this.appearanceAge+=dt;
    if(!this.reduced)this.time+=dt;
    for(const key of Object.keys(this.current) as (keyof FlowerProfile)[])this.current[key]=approach(this.current[key],this.target[key],dt,this.reduced ? .15 : 2.2);
    for(const key of MORPHOLOGY_KEYS)this.genes[key]=approach(this.genes[key],this.targetGenes[key],dt,this.reduced ? .15 : 1.65);
    this.growth=approach(this.growth,this.growthTarget,dt,this.reduced ? .15 : 2.2);
    for(let i=0;i<4;i++)this.reveals[i]=approach(this.reveals[i],this.revealTargets[i],dt,this.reduced ? .15 : 1.3);
    this.rotation.update(dt,this.reduced);this.dawn=approach(this.dawn,this.dawnTarget,dt,.65);this.draw();
    this.canvas.dataset.petalMaturity=petalMaturity(this.growth).toFixed(3);
    this.canvas.dataset.appearance=flowerAppearance(this.appearanceAge,this.reduced).toFixed(3);
    this.canvas.dataset.colorAlgorithm=COLOR_ALGORITHMS[this.colorAlgorithm].id;
    this.canvas.dataset.closedBud=String(this.reveals[0]<.005);
    this.canvas.dataset.stageSettled=String(this.reveals.every((v,i)=>Math.abs(v-this.revealTargets[i])<.015));
    document.documentElement.dataset.rendered='true';(window as unknown as Record<string,unknown>).__VISUAL_READY__=true;
    this.frame=requestAnimationFrame(this.tick);
  };
  private draw(c=this.ctx,w=this.width,h=this.height,photo=false):void {
    const m=this.genes,d=this.dawn,palette=generateColors(this.current,this.seed,this.palette,this.colorAlgorithm);
    const rgb=(a:number[],b:number[])=>`rgb(${a.map((v,i)=>Math.round(lerp(v,b[i],d))).join(',')})`;
    const background=rgb([18,20,35],[231,223,210]),metal=palette.metal;
    c.fillStyle=background;c.fillRect(0,0,w,h);
    const unit=photo?Math.min(w*.20,h*.135):Math.min(w*.18,h*.11,155);
    c.save();c.globalAlpha=flowerAppearance(this.appearanceAge,this.reduced);c.translate(w/2,h*(photo?.53:.53));c.lineJoin='round';c.lineCap='round';
    c.rotate((this.rotation.state.yaw-.35)*.18+this.rotation.state.roll*.35);
    c.strokeStyle=metal;c.lineWidth=Math.max(1.5,m.stemRadius*unit*.7);
    const bottom=unit*(m.stemLength*.45+.8);
    for(let i=0;i<Math.round(m.stemCount);i++) {
      const offset=Math.sin(i*2.4)*m.stemBend*unit;
      c.beginPath();c.moveTo(0,0);c.bezierCurveTo(offset,bottom*.35,-offset,bottom*.7,0,bottom);c.stroke();
    }
    for(let i=0;i<Math.round(m.ringCount);i++) {
      const radius=unit*m.ringRadius*(.28+.72*i/Math.max(1,Math.round(m.ringCount)-1))*.65;
      c.save();c.translate(0,bottom);c.rotate(this.time*m.ringSpeed*(i%2?1:-1)+i*2.4);
      c.beginPath();c.ellipse(0,0,radius*m.ringAspect,radius,0,0,Math.PI*2);
      c.lineWidth=Math.max(2,m.ringThickness*unit);c.stroke();c.restore();
    }
    for(let layer=0;layer<Math.ceil(m.layers);layer++) {
      const reveal=layerReveal(layer,m.layers,this.reveals);if(reveal<.002)continue;
      const count=layerPetalCount(m,layer),size=Math.max(.23,1-layer*m.layerShrink)*reveal*petalMaturity(this.growth);
      for(let i=0;i<Math.ceil(count);i++) {
        const angle=i/count*Math.PI*2+layer*2.399963,asym=1-m.asymmetry*(.5+.5*Math.cos(angle));
        c.save();c.rotate(angle);c.scale(size*clamp01(count-i),size*asym);c.beginPath();
        for(let j=0;j<=36;j++){const [x,y]=petalOutline(m,j/36,-1);j?c.lineTo(x*unit,-y*unit):c.moveTo(x*unit,-y*unit);}
        for(let j=36;j>=0;j--){const [x,y]=petalOutline(m,j/36,1);c.lineTo(x*unit,-y*unit);}
        c.closePath();c.fillStyle=layer%2?palette.b:palette.a;c.fill();
        c.strokeStyle=background;c.lineWidth=Math.max(1.5,m.thickness*unit*.25);c.stroke();c.restore();
      }
    }
    const bud=1-this.reveals[0];
    if(bud>.002) {
      c.save();c.globalAlpha=bud;c.fillStyle=palette.a;c.strokeStyle=metal;c.lineWidth=2;
      const width=unit*m.budWidth,height=unit*m.budLength;
      c.beginPath();c.moveTo(0,-height);c.bezierCurveTo(width*.9,-height*.75,width,-height*.1,0,0);
      c.bezierCurveTo(-width,-height*.1,-width*.9,-height*.75,0,-height);c.closePath();c.fill();c.stroke();
      for(let i=1;i<Math.round(m.budPetals);i++) {
        const fraction=i/Math.round(m.budPetals)*2-1;
        c.beginPath();c.moveTo(0,0);c.quadraticCurveTo(fraction*width,-height*.4,0,-height);c.stroke();
      }
      c.restore();
    }
    if(this.reveals[2]>.002) {
      c.fillStyle=metal;
      for(let i=0;i<Math.round(m.stamenCount);i++) {
        const angle=i/m.stamenCount*Math.PI*2,r=m.stamenSpread*unit*this.reveals[2];
        c.beginPath();c.arc(Math.cos(angle)*r,Math.sin(angle)*r,m.antherSize*unit,0,Math.PI*2);c.fill();
      }
      c.beginPath();c.arc(0,0,m.coreSize*unit,0,Math.PI*2);c.fill();
    }
    for(let i=0;i<Math.round(m.shardCount);i++) {
      const reveal=i<m.shardCount*.45?this.reveals[1]:this.reveals[3];if(reveal<.002)continue;
      const angle=i/m.shardCount*Math.PI*2+this.time*m.shardOrbit*(i%2?1:-1),radius=m.shardRadius*unit;
      const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius,r=m.shardSize*unit*reveal;
      c.beginPath();c.moveTo(x,y-r*m.shardAspect);c.lineTo(x+r,y);c.lineTo(x,y+r*m.shardAspect);c.lineTo(x-r,y);c.closePath();c.fillStyle=palette.b;c.fill();
    }
    c.restore();
  }
  dispose():void {
    this.disposed=true;cancelAnimationFrame(this.frame);this.observer.disconnect();this.rotation.dispose();
    document.removeEventListener('visibilitychange',this.visibility);this.canvas.remove();
  }
}
