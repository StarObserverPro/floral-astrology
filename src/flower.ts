import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { approach, lerp, seededRandom } from './math.ts';
import { BLOOM_STAGE_NAMES, bloomStage, revealTargets, flowerAppearance, petalMaturity } from './bloom.ts';
import { FlowerRotation } from './rotation.ts';
import type { FlowerProfile } from './quiz.ts';

import { FlowerModel } from './flower-model.ts';
import { PALETTES, COLOR_ALGORITHMS, generateColors } from './color.ts';
import { lightOrbits } from './lighting.ts';
import { AtmosphereField } from './atmosphere.ts';
import { DiffusionPass } from './diffusion.ts';
import { prepareGpu, waitForGpu } from './warmup.ts';
import { dominantFamily } from './morphology.ts';
import { renderScale, supportedSamples } from './render-quality.ts';

function makeMotes(seed: number): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const random = seededRandom(seed), data: number[] = [], phase: number[] = [];
  for (let i = 0; i < 340; i++) {
    data.push((random()-.5)*17, (random()-.5)*13, (random()-.5)*13-2);
    phase.push(random()*Math.PI*2, .5+random()*2, random());
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(data, 3));
  geometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 3));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uDawn: { value: 0 }, uDpr: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec3 aPhase;
      uniform float uTime;
      uniform float uDpr;
      varying float vTwinkle;
      varying float vBlur;
      void main() {
        vec3 p = position;
        p.x += sin(uTime*.12+aPhase.x)*.18;
        p.y += sin(uTime*.09+aPhase.x*2.0)*.22;
        vec4 mv = modelViewMatrix * vec4(p,1.0);
        float focus = 1.0 + max(0.0,7.0 + mv.z)*1.0;
        gl_PointSize = clamp(aPhase.y*19.0/max(2.0,-mv.z)*uDpr*focus,1.0,24.0*uDpr);
        gl_Position = projectionMatrix*mv;
        vTwinkle = .25+.65*pow(.5+.5*sin(uTime*.6+aPhase.x),2.0);
        vBlur = focus;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uDawn;
      varying float vTwinkle;
      varying float vBlur;
      void main() {
        float d=length(gl_PointCoord-.5)*2.0;
        float a=exp(-d*d*mix(6.0,3.0,min(1.0,vBlur/4.0)))*smoothstep(1.0,.5,d);
        vec3 c=mix(vec3(.80,.76,1.0),vec3(.90,.67,.35),uDawn);
        gl_FragColor=vec4(c,a*vTwinkle*mix(.8,.38,uDawn)/sqrt(vBlur));
      }
    `,
  });
  return new THREE.Points(geometry, material);
}

export class FlowerScene {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene=new THREE.Scene();
  private camera=new THREE.PerspectiveCamera(38,1,.1,60);
  private composer:EffectComposer;
  private bloom:UnrealBloomPass;
  private smaa:SMAAPass;
  private diffusion=new DiffusionPass();
  private rotation:FlowerRotation;
  private flower=new FlowerModel();
  private atmosphere=new AtmosphereField();
  private motes=makeMotes(271828);
  private key=new THREE.DirectionalLight('#ffe3c7',1);
  private fill=new THREE.DirectionalLight('#b6caff',.6);
  private heart=new THREE.PointLight('#f7ccfa',3,7,2);
  private sparkle=new THREE.PointLight('#fff1dc',9,10,2);
  private keyArea=new THREE.RectAreaLight('#fff0dc',4.6,3.5,5);
  private rimArea=new THREE.RectAreaLight('#cbdcff',5,.65,4.5);
  private backArea=new THREE.RectAreaLight('#efcdec',3.5,4.5,2.8);
  private ambient=new THREE.HemisphereLight('#e2dcff','#302430',.6);
  private profile:FlowerProfile={outward:.5,dream:.5,softness:.5,freedom:.5};
  private target={...this.profile};
  private growth=0;
  private growthTarget=0;
  private reveals=[0,0,0,0];
  private revealTargets=[0,0,0,0];
  private unlockedStage=0;
  private dawn=0;
  private dawnTarget=0;
  private palette=0;
  private colorAlgorithm=1;
  private seed=20261105;
  private colorA=new THREE.Color(generateColors(this.profile,this.seed).a);
  private colorB=new THREE.Color(generateColors(this.profile,this.seed).b);
  private colorMetal=new THREE.Color(generateColors(this.profile,this.seed).metal);
  private colorMetalB=new THREE.Color(generateColors(this.profile,this.seed).metalB);
  private colorMetalC=new THREE.Color(generateColors(this.profile,this.seed).metalC);
  private nextMetal=this.colorMetal.clone();
  private nextMetalB=this.colorMetalB.clone();
  private nextMetalC=this.colorMetalC.clone();
  private appearanceAge=0;
  private nextA=this.colorA.clone();
  private nextB=this.colorB.clone();
  private clock=0;
  private last=0;
  private disposed=false;
  private ready=false;
  private preparation:Promise<void>|undefined;
  private frame=0;
  private sampleFrames=0;
  private sampleTime=0;
  private dpr=1;
  private slowWindows=0;
  private photoSamples=4;
  private frameMs=0;
  private reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  private environment:THREE.WebGLRenderTarget;
  private resizeObserver:ResizeObserver;

  constructor(private container:HTMLElement) {
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
    this.canvas=this.renderer.domElement;
    this.canvas.setAttribute('role','img');this.canvas.setAttribute('data-flower','');
    this.canvas.dataset.renderer='webgl';container.append(this.canvas);
    this.rotation=new FlowerRotation(this.canvas);
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure=1.02;
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;
    this.renderer.transmissionResolutionScale=.85;
    const room=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(this.renderer);
    this.environment=pmrem.fromScene(room,.04);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.55;
    room.dispose();pmrem.dispose();
    const background=new THREE.Mesh(new THREE.PlaneGeometry(2,2),new THREE.ShaderMaterial({
      uniforms:{tAir:{value:this.atmosphere.target.texture}},depthTest:false,depthWrite:false,toneMapped:false,
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,.9999,1.);}',
      fragmentShader:'varying vec2 vUv;uniform sampler2D tAir;void main(){gl_FragColor=texture2D(tAir,vUv);}',
    }));
    background.frustumCulled=false;background.renderOrder=-1000;
    this.scene.add(background,this.motes,this.flower.root,this.ambient);
    this.key.position.set(4,7,5);this.fill.position.set(-5,2,-2);
    this.heart.position.set(0,.9,.2);this.sparkle.position.set(2.5,2.9,3.6);
    RectAreaLightUniformsLib.init();
    this.keyArea.position.set(-3.4,3.6,4.2);this.rimArea.position.set(3.7,1.6,1.8);this.backArea.position.set(-1.6,3.1,-3.1);
    for(const area of [this.keyArea,this.rimArea,this.backArea]) area.lookAt(0,.6,0);
    this.scene.add(this.key,this.fill,this.heart,this.sparkle,this.keyArea,this.rimArea,this.backArea);
    const gl=this.renderer.getContext() as WebGL2RenderingContext;
    const available=Array.from(gl.getInternalformatParameter(gl.RENDERBUFFER,gl.RGBA16F,gl.SAMPLES) as Int32Array ?? []);
    const samples=supportedSamples(available,4);
    const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples});
    target.texture.name='Floral.HDR.Supersampled.MSAA';
    this.photoSamples=supportedSamples(available,4);
    this.composer=new EffectComposer(this.renderer,target);
    this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.bloom=new UnrealBloomPass(new THREE.Vector2(1,1),.14,.60,1.65);this.composer.addPass(this.bloom);
    this.composer.addPass(this.diffusion);
    this.smaa=new SMAAPass();this.composer.addPass(this.smaa);this.composer.addPass(new OutputPass());
    this.resizeObserver=new ResizeObserver(this.resize);this.resizeObserver.observe(container);
    document.addEventListener('visibilitychange',this.onVisibility);
    this.canvas.addEventListener('webglcontextlost',this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored',this.onContextRestored);
    this.resize();this.renderer.info.autoReset=false;
    this.canvas.dataset.warmup='pending';
  }

  prepare():Promise<void> {
    if(this.preparation)return this.preparation;
    this.preparation=(async()=>{
      const started=performance.now();
      const restore=this.flower.prepareAllVariants(),output=this.composer.renderToScreen;
      const box=this.container.getBoundingClientRect();
      const compileTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType});
      let layoutRestored=false;
      const restoreLayout=()=>{if(layoutRestored)return;restore();this.applySize(box.width,box.height);layoutRestored=true;};
      this.composer.renderToScreen=false;this.canvas.dataset.warmup='compiling';
      try {
        await prepareGpu({
          compile:async()=>{
            const previous=this.renderer.getRenderTarget();this.renderer.setRenderTarget(compileTarget);
            try{await this.renderer.compileAsync(this.scene,this.camera);}finally{this.renderer.setRenderTarget(previous);}
          },
          draw:()=>{
            if(this.disposed)return;this.canvas.dataset.warmup='drawing';
            const width=Math.min(480,box.width),height=Math.min(320,box.height);
            this.renderer.setPixelRatio(1);this.renderer.setSize(width,height,false);
            this.composer.setPixelRatio(1);this.composer.setSize(width,height);this.diffusion.setDpr(1);this.atmosphere.setSize(width,height);
            this.renderFrame();this.renderFrame();
            restoreLayout();this.flower.update(0,0,this.growth,this.reveals,this.colorA,this.colorB,this.reduced);
            this.flower.setAppearance(0,this.colorMetal,this.colorMetalB,this.colorMetalC);this.canvas.dataset.warmup='uploading';
            this.renderFrame();
          },
          fence:()=>this.disposed?Promise.resolve():waitForGpu(this.renderer.getContext() as WebGL2RenderingContext),
          restore:()=>{restoreLayout();compileTarget.dispose();this.composer.renderToScreen=output;},
        });
        if(this.disposed)return;
        this.appearanceAge=0;this.last=0;this.ready=true;
        this.flower.update(0,0,this.growth,this.reveals,this.colorA,this.colorB,this.reduced);
        this.flower.setAppearance(0,this.colorMetal,this.colorMetalB,this.colorMetalC);
        this.renderFrame();this.canvas.dataset.warmup='ready';this.canvas.dataset.warmupMs=(performance.now()-started).toFixed(0);
        document.documentElement.dataset.rendered='true';
        this.frame=requestAnimationFrame(this.tick);
      } catch(error){this.canvas.dataset.warmup='failed';throw error;}
    })();
    return this.preparation;
  }

  setProfile(profile:FlowerProfile,progress:number,reset=false,seed=20261105):void {
    this.target={...profile};this.seed=seed;this.flower.setProfile(profile,seed);this.retargetColors();
    if(reset){this.appearanceAge=0;this.growth=0;this.reveals=[0,0,0,0];}
    this.growthTarget=reset?progress:Math.max(this.growthTarget,progress);
    this.unlockedStage=reset?bloomStage(progress):Math.max(this.unlockedStage,bloomStage(progress));
    this.revealTargets=revealTargets(this.unlockedStage/4);
    this.canvas.dataset.bloomStage=BLOOM_STAGE_NAMES[this.unlockedStage];
    this.canvas.dataset.silhouette=dominantFamily(profile);
  }
  setTheme(theme:'dawn'|'night',immediate=false):void {
    this.dawnTarget=theme==='dawn'?1:0;if(immediate)this.dawn=this.dawnTarget;
  }
  private retargetColors():void {
    const colors=generateColors(this.target,this.seed,this.palette,this.colorAlgorithm);
    this.nextA.set(colors.a);this.nextB.set(colors.b);this.nextMetal.set(colors.metal);
    this.nextMetalB.set(colors.metalB);this.nextMetalC.set(colors.metalC);
  }
  setPalette(index:number):void {if(!PALETTES[index])return;this.palette=index;this.retargetColors();}
  setColorAlgorithm(index:number):void {if(!COLOR_ALGORITHMS[index])return;this.colorAlgorithm=index;this.retargetColors();}
  resetView():void {this.rotation.reset();}

  snapshot(width:number,height:number):HTMLCanvasElement {
    if(!this.ready)throw new Error('The flower is still preparing.');
    if(this.renderer.getContext().isContextLost())throw new Error('The graphics context is unavailable.');
    const box=this.container.getBoundingClientRect(),canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=height;
    const samples=this.composer.renderTarget1.samples;
    try {
      // One physical render, including solid rims and the exact current pose.
      // Retain supported MSAA levels when capturing; never assume 2 is supported.
      this.composer.renderTarget1.samples=this.composer.renderTarget2.samples=this.photoSamples;
      this.renderer.setPixelRatio(1);this.renderer.setSize(width,height,false);
      this.composer.setPixelRatio(1);this.composer.setSize(width,height);this.diffusion.setDpr(1);this.atmosphere.setSize(width,height);
      this.camera.aspect=width/height;this.camera.fov=39;
      this.camera.position.set(0,5.2,11.4);this.camera.lookAt(0,.62,0);this.camera.updateProjectionMatrix();
      this.motes.material.uniforms.uDpr.value=1;
      this.renderFrame();
      const context=canvas.getContext('2d');if(!context)throw new Error('The photo canvas is unavailable.');
      context.drawImage(this.canvas,0,0);return canvas;
    } finally {this.composer.renderTarget1.samples=this.composer.renderTarget2.samples=samples;this.applySize(box.width,box.height);this.renderFrame();}
  }

  private onVisibility=():void=>{
    if(document.hidden)cancelAnimationFrame(this.frame);
    else if(!this.disposed&&this.ready){this.last=0;this.frame=requestAnimationFrame(this.tick);}
  };
  private onContextLost=(event:Event):void=>{
    event.preventDefault();cancelAnimationFrame(this.frame);this.ready=false;this.container.dispatchEvent(new CustomEvent('flower-context-lost'));
  };
  private onContextRestored=():void=>{
    if(this.disposed)return;this.preparation=undefined;
    void this.prepare().then(()=>{this.container.dispatchEvent(new CustomEvent('flower-context-restored'));}).catch(error=>console.warn('Graphics preparation failed.',error));
  };
  private resize=():void=>{
    const {width,height}=this.container.getBoundingClientRect();if(!width||!height)return;
    this.dpr=renderScale(width,height,devicePixelRatio||1);this.applySize(width,height);
  };
  private applySize(width:number,height:number):void {
    this.renderer.setPixelRatio(this.dpr);this.renderer.setSize(width,height);
    this.composer.setPixelRatio(this.dpr);this.composer.setSize(width,height);
    const portrait=width/height<.85;
    this.camera.aspect=width/height;this.camera.fov=portrait?44:38;
    this.camera.position.set(0,portrait?5.7:4.8,portrait?12.4:10.5);
    this.camera.lookAt(0,portrait?1.05:1.15,0);this.camera.updateProjectionMatrix();
    this.atmosphere.setSize(width*this.dpr,height*this.dpr);this.diffusion.setDpr(this.dpr);this.motes.material.uniforms.uDpr.value=this.dpr;
    this.canvas.dataset.renderScale=this.dpr.toFixed(2);
    this.canvas.dataset.msaa=String(this.composer.renderTarget1.samples);
  }

  private tick=(now:number):void=>{
    if(this.disposed||!this.ready||document.hidden)return;
    const rawDt=this.last?(now-this.last)/1000:1/60,dt=Math.min(.25,rawDt);
    this.last=now;this.clock+=dt;this.appearanceAge+=dt;
    const time=this.reduced?0:this.clock;
    for(const key of Object.keys(this.profile) as (keyof FlowerProfile)[]) this.profile[key]=approach(this.profile[key],this.target[key],dt,this.reduced ? .15 : 2.2);
    this.growth=approach(this.growth,this.growthTarget,dt,this.reduced ? .15 : 2.2);
    for(let i=0;i<4;i++)this.reveals[i]=approach(this.reveals[i],this.revealTargets[i],dt,this.reduced ? .15 : 1.3);
    this.dawn=approach(this.dawn,this.dawnTarget,dt,.65);
    this.colorA.lerp(this.nextA,1-Math.exp(-dt*2.4));this.colorB.lerp(this.nextB,1-Math.exp(-dt*2.4));this.colorMetal.lerp(this.nextMetal,1-Math.exp(-dt*2.4));
    this.colorMetalB.lerp(this.nextMetalB,1-Math.exp(-dt*2.4));this.colorMetalC.lerp(this.nextMetalC,1-Math.exp(-dt*2.4));
    this.flower.update(dt,time,this.growth,this.reveals,this.colorA,this.colorB,this.reduced);
    this.flower.setAppearance(flowerAppearance(this.appearanceAge,this.reduced),this.colorMetal,this.colorMetalB,this.colorMetalC);
    this.rotation.update(dt,this.reduced);const view=this.rotation.state;
    this.flower.root.rotation.set(view.pitch,view.yaw,view.roll,'ZXY');this.flower.root.position.y=Math.sin(time*.65)*.018;
    const lights=lightOrbits(time);
    this.keyArea.position.fromArray(lights.key);this.rimArea.position.fromArray(lights.rim);this.backArea.position.fromArray(lights.back);this.sparkle.position.fromArray(lights.point);
    for(const area of [this.keyArea,this.rimArea,this.backArea])area.lookAt(0,.6,0);
    this.motes.material.uniforms.uTime.value=time;this.motes.material.uniforms.uDawn.value=this.dawn;
    this.key.intensity=lerp(.45,.9,this.dawn);this.fill.intensity=lerp(.3,.5,this.dawn);this.ambient.intensity=lerp(.3,.6,this.dawn);
    this.heart.intensity=lerp(1.4,.65,this.dawn)*(.4+.6*this.reveals[2]);this.sparkle.intensity=lerp(4.2,3.5,this.dawn);
    this.keyArea.intensity=lerp(2.6,3.9,this.dawn);this.rimArea.intensity=lerp(2.9,2.4,this.dawn);this.backArea.intensity=lerp(1.9,2.2,this.dawn);
    this.bloom.strength=lerp(.14,.09,this.dawn);this.renderer.toneMappingExposure=lerp(.98,.9,this.dawn);
    this.diffusion.amount=lerp(.85,1.2,this.dawn);
    this.renderer.info.reset();this.renderFrame();
    // Resolution adapts only after sustained slow windows; morphology, solid
    // band dimensions, MSAA and SMAA remain intact.
    if(this.clock>4){
      this.sampleTime+=Math.min(rawDt,.5);this.sampleFrames++;
      this.frameMs=this.sampleTime/this.sampleFrames*1000;
      if(this.sampleFrames>=120){
        this.slowWindows=this.sampleTime/this.sampleFrames>.045?this.slowWindows+1:0;
        if(this.slowWindows>=3&&this.dpr>1.25){
          this.dpr=Math.max(1.25,this.dpr*.9);const box=this.container.getBoundingClientRect();this.applySize(box.width,box.height);this.slowWindows=0;
        }
        this.sampleFrames=0;this.sampleTime=0;
      }
    }
    this.canvas.dataset.appearance=flowerAppearance(this.appearanceAge,this.reduced).toFixed(3);
    this.canvas.dataset.petalMaturity=petalMaturity(this.growth).toFixed(3);
    this.canvas.dataset.colorAlgorithm=COLOR_ALGORITHMS[this.colorAlgorithm].id;
    this.canvas.dataset.generatedColors=[this.colorA.getHexString(),this.colorB.getHexString()].join(',');
    this.canvas.dataset.generatedMetals=[this.colorMetal,this.colorMetalB,this.colorMetalC].map(c=>c.getHexString()).join(',');
    this.canvas.dataset.lightPosition=this.sparkle.position.toArray().map(v=>v.toFixed(2)).join(',');
    this.canvas.dataset.frameMs=this.frameMs.toFixed(1);
    this.canvas.dataset.closedBud=String(this.reveals[0]<.005);
    const details=this.flower.diagnostics();
    this.canvas.dataset.ringSurfaces=(details.ringSurfaces as string[]).join(',');
    this.canvas.dataset.petalCount=String(details.petals);this.canvas.dataset.layerCount=String(details.layers);this.canvas.dataset.ringCount=String(details.rings);
    this.canvas.dataset.stageSettled=String(this.reveals.every((v,i)=>Math.abs(v-this.revealTargets[i])<.015));
    if(this.clock>.12){document.documentElement.dataset.rendered='true';(window as unknown as Record<string,unknown>).__VISUAL_READY__=true;}
    this.frame=requestAnimationFrame(this.tick);
  };

  private renderFrame():void {
    this.atmosphere.render(this.renderer,this.camera,this.keyArea,this.sparkle,this.dawn,this.reduced?0:this.clock);
    this.composer.render();
  }

  diagnostics():Record<string,unknown> {
    return {webgl:this.renderer.capabilities.isWebGL2,warmup:this.canvas.dataset.warmup,dpr:this.dpr,frameMs:this.frameMs,growth:this.growth,targetGrowth:this.growthTarget,profile:{...this.profile},
      stage:BLOOM_STAGE_NAMES[this.unlockedStage],reveals:[...this.reveals],...this.flower.diagnostics(),
      rotation:{yaw:this.rotation.state.yaw,pitch:this.rotation.state.pitch},
      antialias:{samples:this.composer.renderTarget1.samples,smaa:this.smaa.enabled,supersampling:true},
      geometries:this.renderer.info.memory.geometries,textures:this.renderer.info.memory.textures,
      calls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,contextLost:this.renderer.getContext().isContextLost()};
  }

  dispose():void {
    this.disposed=true;cancelAnimationFrame(this.frame);this.resizeObserver.disconnect();this.rotation.dispose();
    document.removeEventListener('visibilitychange',this.onVisibility);
    this.canvas.removeEventListener('webglcontextlost',this.onContextLost);this.canvas.removeEventListener('webglcontextrestored',this.onContextRestored);
    const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
    this.scene.traverse(object=>{
      if(object instanceof THREE.Mesh||object instanceof THREE.Points){
        geometries.add(object.geometry);(Array.isArray(object.material)?object.material:[object.material]).forEach(material=>materials.add(material));
        if(object instanceof THREE.InstancedMesh)object.dispose();
      }
    });
    geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());this.environment.dispose();this.atmosphere.dispose();
    this.composer.passes.forEach(pass=>pass.dispose());this.composer.dispose();this.renderer.dispose();this.canvas.remove();
  }
}
