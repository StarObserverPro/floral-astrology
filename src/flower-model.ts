import * as THREE from 'three';
import { approach, clamp01, lerp } from './math.ts';
import { MAX_LAYERS, MAX_PETALS_PER_LAYER, MORPHOLOGY_KEYS, dominantFamily, layerPetalCount, layerReveal, morphologyFromProfile, ringCenter, totalPetalCount } from './morphology.ts';
import type { Morphology } from './morphology.ts';
import type { FlowerProfile } from './quiz.ts';

type Scalar = { value: number };
type PetalUniforms = {
  uLength: Scalar; uWidth: Scalar; uRoundness: Scalar; uTaper: Scalar; uCup: Scalar;
  uRuffle: Scalar; uNotch: Scalar; uThickness: Scalar; uTwist: Scalar; uEdge: Scalar;
  uDream: Scalar; uColorA: { value: THREE.Color }; uColorB: { value: THREE.Color };
};
type PetalLayer = { glass: THREE.InstancedMesh; edge: THREE.InstancedMesh; uniforms: PetalUniforms };

const petalGLSL = /* glsl */`
uniform float uLength, uWidth, uRoundness, uTaper, uCup, uRuffle, uNotch, uThickness, uTwist, uEdge;
varying vec2 vPetal;
vec3 petalPoint(vec3 p) {
  float t = clamp(p.x, .0001, .9999);
  float s = p.y;
  // The narrow second strip is a solid metal rim, not a screen-space line.
  if (abs(s) > 1.5) s = sign(s) * (1.0 - uEdge * (abs(s)-2.0));
  float wave = max(.00001, sin(pow(t,uTaper)*3.14159265));
  float width = pow(wave,uRoundness);
  float x = s * width * uWidth;
  float ruffle = sin(t*28.0 + s*4.0) * pow(abs(s),4.0) * wave * uRuffle;
  float y = (t*t*uCup + s*s*wave*uCup*.65 + ruffle) * uLength;
  y += sin(t*3.14159265) * s * uTwist * .24;
  y += p.z * uThickness * .5 * (.65+.35*wave) * sqrt(1.0-s*s*.72);
  float z = t*uLength*(1.0-uNotch*pow(t,8.0)*pow(1.0-abs(s),4.0));
  return vec3(x,y,z);
}
`;

function laminaGeometry(border = false): THREE.BufferGeometry {
  const vertices: number[] = [], indices: number[] = [];
  const rows=40, columns=border ? 1 : 20, strips=border ? [-1,1] : [0], sides=border ? [1.025] : [1,-1];
  for (const strip of strips) for (const side of sides) {
    const start=vertices.length/3;
    for(let r=0;r<=rows;r++) for(let c=0;c<=columns;c++) {
      const s=border ? strip*(2+c) : c/columns*2-1;
      vertices.push(r/rows,s,side);
    }
    for(let r=0;r<rows;r++) for(let c=0;c<columns;c++) {
      const a=start+r*(columns+1)+c,b=a+columns+1;
      if(side>0) indices.push(a,b,a+1,a+1,b,b+1);
      else indices.push(a,a+1,b,a+1,b+1,b);
    }
  }
  if(!border) {
    const surface=(rows+1)*(columns+1);
    for(let r=0;r<rows;r++) for(const c of [0,columns]) {
      const a=r*(columns+1)+c,b=a+columns+1;
      indices.push(a,a+surface,b,b,a+surface,b+surface);
    }
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('normal',new THREE.Float32BufferAttribute(vertices.map((_,i)=>i%3===1?1:0),3));
  geometry.setIndex(indices);
  geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),5);
  return geometry;
}

function petalUniforms(): PetalUniforms {
  return {
    uLength:{value:1.5},uWidth:{value:.6},uRoundness:{value:.6},uTaper:{value:1},uCup:{value:.2},
    uRuffle:{value:0},uNotch:{value:0},uThickness:{value:.1},uTwist:{value:0},uEdge:{value:.04},
    uDream:{value:.5},uColorA:{value:new THREE.Color()},uColorB:{value:new THREE.Color()},
  };
}
function crystalMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color:'#ffffff',metalness:0,roughness:.08,transmission:.96,thickness:.45,ior:1.65,
    dispersion:.24,clearcoat:.45,clearcoatRoughness:.085,attenuationColor:'#d1bce9',attenuationDistance:1.7,
    envMapIntensity:1.45,side:THREE.DoubleSide,
  });
}
function petalMaterial(uniforms: PetalUniforms, metal=false): THREE.MeshPhysicalMaterial {
  const material=metal ? new THREE.MeshPhysicalMaterial({color:'#b69460',metalness:.94,roughness:.32,clearcoat:.35,envMapIntensity:.8,side:THREE.DoubleSide}) : crystalMaterial();
  material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,uniforms);
    shader.vertexShader=petalGLSL+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',/* glsl */`
      #include <beginnormal_vertex>
      vec3 du=petalPoint(vec3(position.x+.0005,position.y,position.z))-petalPoint(vec3(position.x-.0005,position.y,position.z));
      vec3 dv=petalPoint(vec3(position.x,position.y+.0005,position.z))-petalPoint(vec3(position.x,position.y-.0005,position.z));
      objectNormal=normalize(cross(du,dv))*sign(position.z);
    `);
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',/* glsl */`
      vec3 transformed=petalPoint(position);
      vPetal=vec2(position.x,position.y);
    `);
    if(!metal) {
      shader.fragmentShader='uniform vec3 uColorA,uColorB; uniform float uDream; varying vec2 vPetal;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',/* glsl */`
        #include <color_fragment>
        float blend=smoothstep(.08,.94,vPetal.x)*(.25+.65*uDream);
        diffuseColor.rgb*=mix(mix(uColorA,uColorB,blend),vec3(1.0),.08);
      `);
    }
  };
  material.customProgramCacheKey=()=>metal?'floral-lamina-metal-v4':'floral-lamina-crystal-v4';
  return material;
}

function instances(geometry: THREE.BufferGeometry,material: THREE.Material,count:number): THREE.InstancedMesh {
  const mesh=new THREE.InstancedMesh(geometry,material,count);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled=false;
  return mesh;
}

export class FlowerModel {
  readonly root=new THREE.Group();
  private layers: PetalLayer[]=[];
  private bud: PetalLayer;
  private calyx: PetalLayer;
  private stems: THREE.InstancedMesh;
  private stemUniforms={uStemLength:{value:1},uStemRadius:{value:.05},uStemBend:{value:.1},uStemSpread:{value:.1},uStemTwist:{value:1}};
  private rings: {mesh:THREE.Mesh;uRadius:Scalar;uTube:Scalar;uDepth:Scalar}[]=[];
  private ringNest=new THREE.Group();
  private pendants: THREE.InstancedMesh;
  private filaments: THREE.InstancedMesh;
  private anthers: THREE.InstancedMesh;
  private shards: THREE.InstancedMesh;
  private collars: THREE.InstancedMesh;
  private core: THREE.Mesh<THREE.BufferGeometry,THREE.MeshPhysicalMaterial>;
  private jewel: THREE.MeshPhysicalMaterial;
  private transform=new THREE.Object3D();
  private genes=morphologyFromProfile({outward:.5,dream:.5,softness:.5,freedom:.5});
  private target={...this.genes};
  private profile:FlowerProfile={outward:.5,dream:.5,softness:.5,freedom:.5};
  private populations=Array.from({length:MAX_LAYERS},(_,i)=>Math.round(layerPetalCount(this.genes,i)));
  private targetPopulations=[...this.populations];

  constructor() {
    const lamina=laminaGeometry(),rim=laminaGeometry(true);
    const layer=(count:number,metal=false):PetalLayer=>{
      const uniforms=petalUniforms(),glass=instances(lamina,petalMaterial(uniforms,metal),count),edge=instances(rim,petalMaterial(uniforms,true),count);
      this.root.add(glass,edge);return {glass,edge,uniforms};
    };
    for(let i=0;i<MAX_LAYERS;i++) this.layers.push(layer(MAX_PETALS_PER_LAYER));
    this.bud=layer(10);
    this.calyx=layer(12,true);
    const gold=new THREE.MeshPhysicalMaterial({color:'#b69460',metalness:.94,roughness:.32,clearcoat:.35,envMapIntensity:.8});
    const stemMaterial=gold.clone();
    stemMaterial.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,this.stemUniforms);
      shader.vertexShader='uniform float uStemLength,uStemRadius,uStemBend,uStemSpread,uStemTwist;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',/* glsl */`
        float t=.5-position.y;
        float bend=sin(t*3.14159265);
        float radius=uStemRadius*(1.0-.34*t);
        vec3 transformed=vec3(position.x*radius+bend*uStemBend,.16-t*uStemLength,position.z*radius+bend*uStemSpread*cos(t*uStemTwist));
      `);
      shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>',/* glsl */`
        #include <beginnormal_vertex>
        objectNormal=normalize(vec3(normal.x,normal.x*cos((.5-position.y)*3.14159265)*uStemBend/uStemLength,normal.z));
      `);
    };
    stemMaterial.customProgramCacheKey=()=>'floral-branch-v1';
    this.stems=instances(new THREE.CylinderGeometry(1,1,1,12,32,true),stemMaterial,4);
    this.root.add(this.stems,this.ringNest);
    const torus=new THREE.TorusGeometry(1,1,16,160);
    for(let i=0;i<6;i++) {
      const material=gold.clone(),uRadius={value:.7},uTube={value:.04},uDepth={value:1};
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,{uRadius,uTube,uDepth});
        shader.vertexShader='uniform float uRadius,uTube,uDepth;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',/* glsl */`
          vec3 transformed=vec3((position.xy-normal.xy)*uRadius+normal.xy*uTube,normal.z*uTube*uDepth);
        `);
      };
      material.customProgramCacheKey=()=>'floral-solid-band-v1';
      const mesh=new THREE.Mesh(torus,material);mesh.frustumCulled=false;
      this.ringNest.add(mesh);this.rings.push({mesh,uRadius,uTube,uDepth});
    }
    const octahedron=new THREE.OctahedronGeometry(1,0);
    this.jewel=crystalMaterial();this.jewel.flatShading=true;
    this.core=new THREE.Mesh(new THREE.IcosahedronGeometry(1,1),this.jewel);
    this.core.frustumCulled=false;
    this.pendants=instances(octahedron,this.jewel,4);
    this.shards=instances(octahedron,this.jewel,24);
    this.collars=instances(new THREE.TorusGeometry(.75,.12,10,32),gold,24);
    this.anthers=instances(octahedron,gold,36);
    this.filaments=instances(new THREE.CylinderGeometry(1,1,1,8),gold,36);
    this.root.add(this.pendants,this.shards,this.collars,this.core,this.anthers,this.filaments);
  }

  setProfile(profile:FlowerProfile,seed:number):void {
    this.profile={...profile};this.target=morphologyFromProfile(profile,seed);
    this.targetPopulations=this.targetPopulations.map((_,i)=>Math.round(layerPetalCount(this.target,i)));
  }

  private setShape(layer:PetalLayer,m:Morphology,a:THREE.Color,b:THREE.Color):void {
    const u=layer.uniforms;
    u.uLength.value=m.length;u.uWidth.value=m.width;u.uRoundness.value=m.roundness;u.uTaper.value=m.taper;
    u.uCup.value=m.cup;u.uRuffle.value=m.ruffle;u.uNotch.value=m.notch;u.uThickness.value=m.thickness;
    u.uTwist.value=m.twist;u.uEdge.value=m.edgeWidth;u.uDream.value=this.profile.dream;
    u.uColorA.value.copy(a);u.uColorB.value.copy(b);
    (layer.glass.material as THREE.MeshPhysicalMaterial).thickness=m.thickness*5;
  }
  private fan(layer:PetalLayer,count:number,scale:number,opening:number,radius:number,y:number,phase:number,asymmetry=0,time=0):void {
    const d=this.transform;
    layer.glass.count=layer.edge.count=Math.min(layer.glass.instanceMatrix.count,Math.ceil(count));
    layer.glass.visible=layer.edge.visible=scale>.002;
    for(let i=0;i<layer.glass.count;i++) {
      const angle=i/Math.max(1,count)*Math.PI*2+phase;
      const variation=1-asymmetry*(.5+.5*Math.cos(angle-phase));
      const size=Math.max(.00001,scale*clamp01(count-i));
      d.position.set(Math.sin(angle)*radius,y,Math.cos(angle)*radius);
      d.rotation.set(opening+Math.sin(time*.38+i*2.4)*.009,angle,Math.sin(i*2.4)*asymmetry*.16,'YXZ');
      d.scale.set(size*(1+asymmetry*.18*Math.sin(angle)),size*variation,size*variation);
      d.updateMatrix();layer.glass.setMatrixAt(i,d.matrix);layer.edge.setMatrixAt(i,d.matrix);
    }
    layer.glass.instanceMatrix.needsUpdate=layer.edge.instanceMatrix.needsUpdate=true;
  }

  update(dt:number,time:number,growth:number,reveals:readonly number[],a:THREE.Color,b:THREE.Color,reduced=false):void {
    const m=this.genes,d=this.transform;
    for(const key of MORPHOLOGY_KEYS) m[key]=approach(m[key],this.target[key],dt,reduced ? .15 : 1.65);
    for(let i=0;i<this.layers.length;i++) {
      const layer=this.layers[i];this.setShape(layer,m,a,b);
      this.populations[i]=approach(this.populations[i],this.targetPopulations[i],dt,reduced ? .15 : 1.65);
      const reveal=layerReveal(i,m.layers,reveals),lengthScale=Math.max(.23,1-m.layerShrink*i);
      this.fan(layer,this.populations[i],reveal*lengthScale,
        lerp(-1.5,m.opening-i*.047,reveal),m.baseRadius,.22+i*m.layerRise*.35,i*2.399963,m.asymmetry,time);
    }
    this.setShape(this.bud,m,a,b);
    const bu=this.bud.uniforms;
    bu.uLength.value=m.budLength;bu.uWidth.value=m.budWidth;bu.uCup.value=.30/m.budLength;
    bu.uRoundness.value=.65;bu.uTaper.value=1;bu.uRuffle.value=m.ruffle*.12;bu.uNotch.value=0;bu.uTwist.value=0;
    this.fan(this.bud,m.budPetals,lerp(.92,.56,reveals[0])*(.98+.035*growth),lerp(-Math.PI/2,.12,reveals[0]),.30,.18,0,0,time);
    this.setShape(this.calyx,m,a,b);
    const cu=this.calyx.uniforms;
    cu.uLength.value=m.calyxLength;cu.uWidth.value=m.calyxWidth;cu.uThickness.value=m.calyxThickness;
    cu.uCup.value=.08+m.cup*.45;cu.uRuffle.value=m.ruffle*.3;cu.uRoundness.value=.55+m.roundness*.4;
    this.fan(this.calyx,m.calyxCount,.55+.45*reveals[1],-.12,.10,.13,.45,m.asymmetry*.3,time);

    const stemLength=m.stemLength*(.62+.38*growth);
    this.stemUniforms.uStemLength.value=stemLength;this.stemUniforms.uStemRadius.value=m.stemRadius;
    this.stemUniforms.uStemBend.value=m.stemBend;this.stemUniforms.uStemSpread.value=m.stemSpread;this.stemUniforms.uStemTwist.value=m.stemTwist;
    this.stems.count=Math.ceil(m.stemCount);
    for(let i=0;i<this.stems.count;i++) {
      d.position.set(0,0,0);d.rotation.set(0,i/m.stemCount*Math.PI*2,0);
      d.scale.setScalar(Math.max(.00001,clamp01(m.stemCount-i)));d.updateMatrix();this.stems.setMatrixAt(i,d.matrix);
    }
    this.stems.instanceMatrix.needsUpdate=true;
    // All six potential bands have exactly the same origin. Only their radii,
    // section dimensions and orientations differ, never their centres.
    this.ringNest.position.fromArray(ringCenter(m,growth));
    const ringCount=Math.round(m.ringCount),outerRadius=Math.max(m.ringRadius,.26+(ringCount-1)*m.ringThickness*2.8);
    for(let i=0;i<this.rings.length;i++) {
      const ring=this.rings[i];ring.mesh.visible=i<ringCount;
      ring.uRadius.value=outerRadius*(.32+.68*i/Math.max(1,ringCount-1))*(.64+.36*reveals[1]);
      ring.uTube.value=m.ringThickness;ring.uDepth.value=m.ringDepth;
      ring.mesh.position.set(0,0,0);
      const phase=i*2.399963,speed=m.ringSpeed*(.65+i*.21);
      ring.mesh.rotation.set(Math.PI/2+Math.sin(time*speed+phase)*m.ringTilt,
        Math.cos(time*speed*.81+phase)*m.ringTilt,time*speed*(i%2?1:-1),'XYZ');
      ring.mesh.scale.set(m.ringAspect,1,1);
    }
    this.pendants.count=Math.ceil(m.pendantCount);
    for(let i=0;i<this.pendants.count;i++) {
      const angle=i/Math.max(1,m.pendantCount)*Math.PI*2+time*.09;
      d.position.set(Math.cos(angle)*m.pendantSize*.7,.16-stemLength-m.pendantSize*(.4+i*.25),Math.sin(angle)*m.pendantSize*.7);
      d.rotation.set(.08*Math.sin(time*.4+i),angle,0);
      const size=m.pendantSize*clamp01(m.pendantCount-i)*(.6+.4*reveals[2]);
      d.scale.set(size,size*m.pendantAspect,size);d.updateMatrix();this.pendants.setMatrixAt(i,d.matrix);
    }
    this.pendants.instanceMatrix.needsUpdate=true;
    const heart=reveals[2];
    this.core.visible=heart>.002;this.core.position.set(0,.34,0);this.core.rotation.set(0,time*.16,0);
    this.core.scale.set(m.coreSize*heart,m.coreSize*m.coreAspect*heart,m.coreSize*heart);
    this.jewel.color.copy(a).lerp(b,.4);this.jewel.thickness=m.shardSize*7;
    this.filaments.count=this.anthers.count=Math.ceil(m.stamenCount);
    this.filaments.visible=this.anthers.visible=heart>.002;
    const up=new THREE.Vector3(0,1,0),start=new THREE.Vector3(),end=new THREE.Vector3(),direction=new THREE.Vector3();
    for(let i=0;i<this.anthers.count;i++) {
      const angle=i/m.stamenCount*Math.PI*2+time*.025;
      start.set(Math.cos(angle)*.09,.24,Math.sin(angle)*.09);
      end.set(Math.cos(angle)*m.stamenSpread,.24+m.stamenLength*(.8+.2*Math.sin(i*2.4+time*.35)),Math.sin(angle)*m.stamenSpread);
      const occupied=clamp01(m.stamenCount-i)*heart;
      d.position.copy(start).lerp(end,.5);direction.subVectors(end,start);
      d.quaternion.setFromUnitVectors(up,direction.clone().normalize());
      d.scale.set(m.stamenThickness*occupied,direction.length()*occupied,m.stamenThickness*occupied);
      d.updateMatrix();this.filaments.setMatrixAt(i,d.matrix);
      d.position.copy(end);d.rotation.set(0,angle,Math.sin(time*.2+i)*.12);
      const size=m.antherSize*occupied;d.scale.set(size,size*m.antherAspect,size);d.updateMatrix();this.anthers.setMatrixAt(i,d.matrix);
    }
    this.filaments.instanceMatrix.needsUpdate=this.anthers.instanceMatrix.needsUpdate=true;
    this.shards.count=this.collars.count=Math.ceil(m.shardCount);
    for(let i=0;i<this.shards.count;i++) {
      const reveal=i<m.shardCount*.45?reveals[1]:reveals[3],phase=i*2.399963;
      const angle=i/m.shardCount*Math.PI*2+time*m.shardOrbit*(i%2?1:-1);
      const radius=m.shardRadius*(.84+.16*Math.sin(phase));
      d.position.set(Math.cos(angle)*radius,.12+Math.sin(phase)*m.shardHeight*.6+Math.sin(time*.38+phase)*.1,Math.sin(angle)*radius);
      d.rotation.set(time*.13+phase,time*.23+phase,Math.sin(time*.2+phase)*.2);
      const size=Math.max(.00001,m.shardSize*reveal*clamp01(m.shardCount-i));
      d.scale.set(size*.7,size*m.shardAspect,size*.7);d.updateMatrix();this.shards.setMatrixAt(i,d.matrix);
      d.scale.set(size,size*.6,size);d.rotateX(Math.PI/2);d.updateMatrix();this.collars.setMatrixAt(i,d.matrix);
    }
    this.shards.instanceMatrix.needsUpdate=this.collars.instanceMatrix.needsUpdate=true;
  }

  diagnostics():Record<string,unknown> {
    return {family:dominantFamily(this.profile),petals:totalPetalCount(this.genes),layers:Math.round(this.genes.layers),
      rings:Math.round(this.genes.ringCount),ringCentersCoincide:this.rings.every(r=>r.mesh.position.lengthSq()===0),
      morphology:{...this.genes}};
  }
}
