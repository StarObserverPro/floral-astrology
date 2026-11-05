import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { approach, lerp, seededRandom, smooth } from './math.ts';
import type { FlowerProfile } from './quiz.ts';

export const PALETTES = [
  { name: '月白紫晶', a: '#c4adf0', b: '#76d8e0', gem: '#ad91dc' },
  { name: '蔷薇石英', a: '#f1b6c8', b: '#d78bda', gem: '#d695ad' },
  { name: '碧色水晶', a: '#a1dfc8', b: '#8ebfe1', gem: '#8ecab7' },
  { name: '蜜色琥珀', a: '#f4d7a3', b: '#e8a685', gem: '#dfba79' },
] as const;

type Uniform<T> = { value: T };
type ShapeUniforms = {
  uLength: Uniform<number>; uWidth: Uniform<number>; uSoftness: Uniform<number>;
  uDream: Uniform<number>; uColorA: Uniform<THREE.Color>; uColorB: Uniform<THREE.Color>;
};
type Petal = { pivot: THREE.Group; layer: number; angle: number; offset: number; phase: number };

const shapeGLSL = /* glsl */`
uniform float uLength;
uniform float uWidth;
uniform float uSoftness;
uniform float uDream;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying vec2 vPetal;
float profile(float t) {
  float x = clamp(t, 0.0, 1.0) * 4.0;
  if (x < 1.0) return mix(.035, .66, x);
  if (x < 2.0) return mix(.66, 1.0, x - 1.0);
  if (x < 3.0) return mix(1.0, .76, x - 2.0);
  return mix(.76, .012, x - 3.0);
}
vec3 petalPoint(vec3 p) {
  float t = clamp(p.x, .0001, .9999);
  float s = p.y;
  float wave = sin(t * 3.14159265);
  float roundWidth = pow(max(wave, .001), .65) * (1.0 - .18 * t);
  float w = mix(profile(t), roundWidth, uSoftness * .88);
  float x = s * w * uWidth;
  float ridge = (1.0 - abs(s)) * wave * .10 * (1.0 - uSoftness);
  float curl = s*s * wave * mix(.22, .44, uSoftness);
  float height = t*t * mix(.30, .44, uSoftness) + curl + ridge;
  height += sin(t*5.0) * s * uDream * .035;
  return vec3(x, height * uLength + p.z * .014 * wave, t * uLength);
}
`;

// One normalized, closed lamina is reused across every petal. Deformation and
// normals run on the GPU; answering never rebuilds geometry or the WebGL scene.
function makePetalGeometry(border = false): THREE.BufferGeometry {
  const vertices: number[] = [], indices: number[] = [];
  const rows = 26, columns = border ? 1 : 16;
  const strips = border ? [-1, 1] : [0];
  const sides = border ? [1.06] : [1, -1];
  for (const strip of strips) {
    for (const side of sides) {
      const start = vertices.length / 3;
      for (let r = 0; r <= rows; r++) {
        for (let c = 0; c <= columns; c++) {
          const s = border ? strip * (c === 0 ? .976 : 1.0) : c / columns * 2 - 1;
          vertices.push(r / rows, s, side);
        }
      }
      for (let r = 0; r < rows; r++) for (let c = 0; c < columns; c++) {
        const a = start + r * (columns + 1) + c, b = a + columns + 1;
        if (side > 0) indices.push(a, b, a + 1, a + 1, b, b + 1);
        else indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
  }
  if (!border) {
    const surfaceSize = (rows + 1) * (columns + 1);
    for (let r = 0; r < rows; r++) for (const c of [0, columns]) {
      const a = r * (columns + 1) + c, b = a + columns + 1;
      indices.push(a, a + surfaceSize, b, b, a + surfaceSize, b + surfaceSize);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(vertices.map((_, i) => i % 3 === 1 ? 1 : 0), 3));
  geometry.setIndex(indices);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 1), 4);
  return geometry;
}

function shapeMaterial(uniforms: ShapeUniforms, metal = false): THREE.MeshPhysicalMaterial {
  const material = new THREE.MeshPhysicalMaterial({
    color: metal ? '#d3b881' : '#ffffff',
    metalness: metal ? .92 : .04,
    roughness: metal ? .24 : .16,
    transmission: metal ? 0 : .78,
    thickness: .5,
    ior: 1.46,
    clearcoat: 1,
    clearcoatRoughness: .16,
    iridescence: metal ? .05 : .34,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [160, 390],
    attenuationColor: '#dfc6ee',
    attenuationDistance: 3.5,
    side: THREE.DoubleSide,
    envMapIntensity: metal ? 1.5 : 1.3,
  });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shapeGLSL + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', /* glsl */`
      #include <beginnormal_vertex>
      vec3 du = petalPoint(vec3(position.x + .001, position.y, position.z)) - petalPoint(vec3(position.x - .001, position.y, position.z));
      vec3 dv = petalPoint(vec3(position.x, position.y + .001, position.z)) - petalPoint(vec3(position.x, position.y - .001, position.z));
      objectNormal = normalize(cross(du, dv)) * sign(position.z);
    `);
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', /* glsl */`
      vec3 transformed = petalPoint(position);
      vPetal = vec2(position.x, position.y);
    `);
    if (!metal) {
      shader.fragmentShader = /* glsl */`
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform float uDream;
        varying vec2 vPetal;
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        float blend = smoothstep(.05, .94, vPetal.x) * (.20 + .65*uDream);
        blend += abs(vPetal.y) * .12;
        diffuseColor.rgb *= mix(uColorA, uColorB, blend);
      `);
    }
  };
  material.customProgramCacheKey = () => metal ? 'floral-lamina-gold-v1' : 'floral-lamina-glass-v1';
  return material;
}

function makeAtmosphere(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uDawn: { value: 0 }, uTime: { value: 0 }, uAspect: { value: 1 } },
    depthWrite: false, depthTest: false,
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, .9999, 1.0); }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vUv;
      uniform float uDawn;
      uniform float uTime;
      uniform float uAspect;
      void main() {
        vec2 p = vUv;
        vec2 q = (p-vec2(.5,.49))*vec2(uAspect,1.0);
        float halo = exp(-dot(q,q)*4.0);
        vec3 night = mix(vec3(.009,.012,.026), vec3(.028,.034,.068), p.y);
        night += halo * vec3(.050,.030,.069);
        night += exp(-length((p-vec2(.24,.75))*vec2(1.0,1.7))*6.0)*vec3(.028,.017,.018);
        vec3 day = mix(vec3(.72,.67,.61), vec3(.92,.86,.73), p.y);
        day += halo * vec3(.15,.14,.15);
        vec2 light = p-vec2(.95,1.30);
        float angle = atan(light.y,light.x);
        float beams = pow(max(0.0,sin(angle*31.0+sin(angle*13.0)*1.3+uTime*.013)),14.0);
        beams += pow(max(0.0,sin(angle*58.0-1.8)),22.0)*.35;
        beams *= smoothstep(.0,.85,p.y) * .18;
        vec3 color = mix(night,day,uDawn);
        color += beams * mix(vec3(.045,.033,.065),vec3(.80,.61,.35),uDawn);
        float vignette = smoothstep(.25,.90,length(q));
        color *= 1.0-vignette*mix(.42,.12,uDawn);
        gl_FragColor = vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

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
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(34, 1, .1, 60);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private root = new THREE.Group();
  private petals: Petal[] = [];
  private shapes: ShapeUniforms[] = [];
  private atmosphere = makeAtmosphere();
  private motes = makeMotes(271828);
  private core: THREE.Mesh;
  private ornaments = new THREE.Group();
  private halo = new THREE.Group();
  private key = new THREE.DirectionalLight('#ffe3c7', 4);
  private fill = new THREE.DirectionalLight('#b6caff', 2.8);
  private heart = new THREE.PointLight('#edc0f8', 8, 7, 2);
  private ambient = new THREE.HemisphereLight('#e2dcff', '#302430', 1.6);
  private profile: FlowerProfile = { outward: .5, dream: .5, softness: .5, freedom: .5 };
  private target = { ...this.profile };
  private growth = .13;
  private growthTarget = .18;
  private dawn = 0;
  private dawnTarget = 0;
  private colorA = new THREE.Color(PALETTES[0].a);
  private colorB = new THREE.Color(PALETTES[0].b);
  private nextA = this.colorA.clone();
  private nextB = this.colorB.clone();
  private pointer = new THREE.Vector2();
  private parallax = new THREE.Vector2();
  private clock = 0;
  private last = 0;
  private disposed = false;
  private frame = 0;
  private sampleFrames = 0;
  private sampleTime = 0;
  private dpr = 1;
  private slowWindows = 0;
  private reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private environment: THREE.WebGLRenderTarget;
  private resizeObserver: ResizeObserver;
  private container: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('aria-label', '随回答逐渐绽放的水晶花');
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('data-flower', '');
    container.append(this.canvas);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(room, .045);
    this.scene.environment = this.environment.texture;
    room.dispose();
    pmrem.dispose();
    this.scene.add(this.root);
    const background = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.atmosphere);
    background.frustumCulled = false;
    background.renderOrder = -1000;
    this.scene.add(background, this.motes, this.ambient);
    this.key.position.set(4, 7, 5);
    this.fill.position.set(-5, 2, -2);
    this.heart.position.set(0, .9, .2);
    this.scene.add(this.key, this.fill, this.heart);
    this.camera.position.set(0, 4.8, 10.5);
    this.camera.lookAt(0, .2, 0);
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), .5, .75, 1.05);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.createFlower();
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(.25, 1), new THREE.MeshPhysicalMaterial({
      color: '#f8e8c8', roughness: .16, metalness: .25, transmission: .55,
      thickness: .8, ior: 1.9, emissive: '#b57a9c', emissiveIntensity: .18,
      clearcoat: 1, envMapIntensity: 1.5,
    }));
    this.core.position.y = .44;
    this.core.scale.set(.8, 1.6, .8);
    this.root.add(this.core);
    this.createSetting();
    this.resizeObserver = new ResizeObserver(this.resize);
    this.resizeObserver.observe(container);
    window.addEventListener('pointermove', this.onPointer, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    this.resize();
    this.frame = requestAnimationFrame(this.tick);
  }

  private createFlower(): void {
    const lamina = makePetalGeometry(), edging = makePetalGeometry(true);
    const random = seededRandom(20261105);
    const counts = [11, 10, 8, 6];
    counts.forEach((count, layer) => {
      const uniforms: ShapeUniforms = {
        uLength: { value: 2.1 - layer * .32 },
        uWidth: { value: .73 - layer * .1 },
        uSoftness: { value: .5 }, uDream: { value: .5 },
        uColorA: { value: this.colorA.clone() }, uColorB: { value: this.colorB.clone() },
      };
      this.shapes.push(uniforms);
      const glass = shapeMaterial(uniforms), gold = shapeMaterial(uniforms, true);
      for (let i = 0; i < count; i++) {
        const pivot = new THREE.Group(), fan = new THREE.Group();
        const angle = i / count * Math.PI * 2 + layer * .41;
        fan.rotation.y = angle;
        fan.position.y = .24 + layer * .13;
        fan.add(pivot);
        this.root.add(fan);
        const blade = new THREE.Mesh(lamina, glass), edge = new THREE.Mesh(edging, gold);
        blade.frustumCulled = edge.frustumCulled = false;
        pivot.add(blade, edge);
        this.petals.push({ pivot, layer, angle, offset: random()-.5, phase: random()*6.28 });
      }
    });
  }

  private createSetting(): void {
    const gold = new THREE.MeshPhysicalMaterial({ color: '#c7ab78', metalness: .94, roughness: .27, clearcoat: .6 });
    const darkGold = gold.clone(); darkGold.color.set('#786648'); darkGold.roughness = .4;
    const jewel = new THREE.MeshPhysicalMaterial({ color: '#d8c6e9', metalness: .12, roughness: .14,
      transmission: .65, thickness: .4, ior: 1.7, clearcoat: 1, envMapIntensity: 1.4 });
    const cup = new THREE.Mesh(new THREE.SphereGeometry(.43, 40, 24, 0, Math.PI*2, Math.PI*.48, Math.PI*.52), gold);
    cup.position.y = .2;
    cup.scale.set(1, .65, 1);
    this.root.add(cup);
    const stemCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, .1, 0), new THREE.Vector3(-.09, -.4, .02),
      new THREE.Vector3(.12, -.95, -.05), new THREE.Vector3(0, -1.48, 0),
    ]);
    const stem = new THREE.Mesh(new THREE.TubeGeometry(stemCurve, 38, .028, 8, false), gold);
    this.root.add(stem, this.ornaments, this.halo);
    for (let k = 0; k < 3; k++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(.53+k*.24, .008-k*.001, 8, 120), k === 2 ? darkGold : gold);
      ring.rotation.x = Math.PI/2 + (k-1)*.11;
      ring.position.y = -1.43+k*.045;
      this.ornaments.add(ring);
    }
    const drop = new THREE.Mesh(new THREE.OctahedronGeometry(.15, 0), jewel);
    drop.position.y = -1.53; drop.scale.y = 1.7;
    this.ornaments.add(drop);
    for (let i = 0; i < 12; i++) {
      const a = i/12*Math.PI*2;
      const anther = new THREE.Mesh(new THREE.OctahedronGeometry(.047, 0), gold);
      anther.position.set(Math.cos(a)*.36, .55+Math.sin(i*1.7)*.06, Math.sin(a)*.36);
      anther.scale.y = 1.8;
      this.root.add(anther);
      const thread = new THREE.CatmullRomCurve3([
        new THREE.Vector3(Math.cos(a)*.15,.25,Math.sin(a)*.15),
        new THREE.Vector3(Math.cos(a)*.34,.40,Math.sin(a)*.34), anther.position,
      ]);
      this.root.add(new THREE.Mesh(new THREE.TubeGeometry(thread, 12, .006, 4, false), gold));
    }
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6+i*.12, .0035, 4, 180), darkGold);
      ring.rotation.x = Math.PI/2 - .65;
      ring.position.set(0, .2, -1.1);
      this.halo.add(ring);
    }
    for (let i = 0; i < 12; i++) {
      const a = i/12*Math.PI*2;
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(i%3 === 0 ? .038 : .018, 0), gold);
      star.position.set(Math.cos(a)*2.72, Math.sin(a)*1.65+.2, Math.sin(a)*1.3-1.1);
      this.halo.add(star);
    }
  }

  setProfile(profile: FlowerProfile, progress: number, reset = false): void {
    this.target = { ...profile };
    const target = .18 + progress * .82;
    this.growthTarget = reset ? target : Math.max(this.growthTarget, target);
  }

  setTheme(theme: 'dawn' | 'night', immediate = false): void {
    this.dawnTarget = theme === 'dawn' ? 1 : 0;
    if (immediate) this.dawn = this.dawnTarget;
  }

  setPalette(index: number): void {
    const palette = PALETTES[index];
    if (!palette) return;
    this.nextA.set(palette.a); this.nextB.set(palette.b);
  }

  private onPointer = (event: PointerEvent): void => {
    if (event.pointerType !== 'mouse') return;
    this.pointer.set(event.clientX / innerWidth * 2 - 1, event.clientY / innerHeight * 2 - 1);
  };

  private onVisibility = (): void => {
    if (document.hidden) cancelAnimationFrame(this.frame);
    else if (!this.disposed) { this.last = 0; this.frame = requestAnimationFrame(this.tick); }
  };

  private onContextLost = (event: Event): void => {
    event.preventDefault(); cancelAnimationFrame(this.frame);
    this.container.dispatchEvent(new CustomEvent('flower-context-lost'));
  };

  private onContextRestored = (): void => {
    if (this.disposed) return;
    this.last = 0; this.frame = requestAnimationFrame(this.tick);
    this.container.dispatchEvent(new CustomEvent('flower-context-restored'));
  };

  private resize = (): void => {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    const budget = Math.sqrt(3_800_000 / (width * height));
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5, budget);
    this.applySize(width, height);
  };

  private applySize(width: number, height: number): void {
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(width, height);
    this.composer.setPixelRatio(this.dpr);
    this.composer.setSize(width, height);
    this.camera.aspect = width/height;
    // Fixed apparent flower size across portrait and desktop; the frame stays
    // clear above for the question and below for the two embedded choices.
    const portrait = width/height < .85;
    this.camera.fov = portrait ? 43 : 38;
    this.camera.position.set(0, portrait ? 5.5 : 4.8, portrait ? 12.0 : 10.5);
    this.camera.lookAt(0, portrait ? 1.1 : .85, 0);
    this.camera.updateProjectionMatrix();
    this.atmosphere.uniforms.uAspect.value = width/height;
    this.motes.material.uniforms.uDpr.value = this.dpr;
  }

  private tick = (now: number): void => {
    if (this.disposed || document.hidden) return;
    const rawDt = this.last ? (now-this.last)/1000 : 1/60;
    const dt = Math.min(.07, rawDt);
    this.last = now; this.clock += dt;
    const motionTime = this.reduced ? 0 : this.clock;
    for (const key of Object.keys(this.profile) as (keyof FlowerProfile)[]) {
      this.profile[key] = approach(this.profile[key], this.target[key], dt, this.reduced ? .15 : 2.2);
    }
    this.growth = approach(this.growth, this.growthTarget, dt, this.reduced ? .15 : 2.2);
    this.dawn = approach(this.dawn, this.dawnTarget, dt, .65);
    this.colorA.lerp(this.nextA, 1-Math.exp(-dt*2.4));
    this.colorB.lerp(this.nextB, 1-Math.exp(-dt*2.4));
    const p = this.profile;
    for (const shape of this.shapes) {
      shape.uSoftness.value = p.softness;
      shape.uDream.value = p.dream;
      shape.uColorA.value.copy(this.colorA);
      shape.uColorB.value.copy(this.colorB);
    }
    for (const petal of this.petals) {
      const { pivot, layer, phase, offset } = petal;
      const maturity = smooth(layer*.13, .58+layer*.13, this.growth);
      const open = lerp(-1.38 + layer*.10, -.22 + layer*.17 + (1-p.outward)*-.44, maturity);
      pivot.rotation.x = open + Math.sin(motionTime*.45+phase)*.008*p.freedom*maturity;
      pivot.rotation.z = offset * p.freedom * .22;
      pivot.position.z = .13 + maturity * p.dream * (.10+layer*.018);
      pivot.position.y = Math.sin(phase+motionTime*.32)*.025*p.dream*maturity;
      const size = lerp(.26+layer*.03, 1, maturity);
      pivot.scale.set(size, size, size);
      if (pivot.parent) pivot.parent.rotation.y = petal.angle + offset*p.freedom*.25;
    }
    this.root.rotation.y = Math.sin(motionTime*.09)*.065;
    this.root.position.y = Math.sin(motionTime*.65)*.022;
    this.ornaments.rotation.y = motionTime*.025;
    this.core.rotation.y = motionTime*.13;
    this.core.scale.setScalar(.65+this.growth*.35);
    this.core.scale.y *= 1.65;
    this.halo.rotation.z = Math.sin(motionTime*.06)*.015;
    this.parallax.lerp(this.pointer, 1-Math.exp(-dt*2));
    this.root.rotation.z = this.reduced ? 0 : -this.parallax.x*.025;
    this.atmosphere.uniforms.uDawn.value = this.dawn;
    this.atmosphere.uniforms.uTime.value = motionTime;
    this.motes.material.uniforms.uTime.value = motionTime;
    this.motes.material.uniforms.uDawn.value = this.dawn;
    this.key.intensity = lerp(3.0, 4.4, this.dawn);
    this.fill.intensity = lerp(2.7, 1.5, this.dawn);
    this.ambient.intensity = lerp(1.0, 1.8, this.dawn);
    this.heart.intensity = lerp(3.8, 1.2, this.dawn);
    this.bloom.strength = lerp(.48, .25, this.dawn);
    this.renderer.toneMappingExposure = lerp(1.08, .95, this.dawn);
    this.composer.render();
    if (this.frame && this.clock > 3 && rawDt < .4) {
      this.sampleTime += rawDt; this.sampleFrames++;
      if (this.sampleFrames >= 90) {
        if (this.sampleTime/this.sampleFrames > .036) this.slowWindows++;
        else this.slowWindows = 0;
        if (this.slowWindows >= 2 && this.dpr > .9) {
          this.dpr = Math.max(.9, this.dpr*.85);
          const box = this.container.getBoundingClientRect();
          this.applySize(box.width, box.height);
          this.slowWindows = 0;
        }
        this.sampleFrames = 0; this.sampleTime = 0;
      }
    }
    if (this.clock > .12) {
      document.documentElement.dataset.rendered = 'true';
      (window as unknown as Record<string, unknown>).__VISUAL_READY__ = true;
    }
    this.frame = requestAnimationFrame(this.tick);
  };

  diagnostics(): Record<string, unknown> {
    return {
      webgl: this.renderer.capabilities.isWebGL2, dpr: this.dpr,
      growth: this.growth, targetGrowth: this.growthTarget, profile: { ...this.profile },
      geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures,
      calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
      contextLost: this.renderer.getContext().isContextLost(),
    };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    window.removeEventListener('pointermove', this.onPointer);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        geometries.add(object.geometry);
        const list = Array.isArray(object.material) ? object.material : [object.material];
        list.forEach(material => materials.add(material));
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    this.environment.dispose();
    this.composer.passes.forEach(pass => pass.dispose());
    this.composer.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
