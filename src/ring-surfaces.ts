import * as THREE from 'three';

export const RING_SURFACES=['round','faceted','mobius','riemann'] as const;
type Ribbon='mobius'|'riemann';
export type RingDimensions={radius:number;tube:number;depth:number;width:number;fold:number};

/** The last form projects (z,sqrt(z)) from four real coordinates into three.
 * Its parameter covers 4π, so both sheets join continuously around the branch.
 * This is a decorative projection, not an embedding of the full complex plane. */
export function ribbonMidPoint(kind:Ribbon,u:number,v:number,p:RingDimensions,out=new THREE.Vector3()):THREE.Vector3 {
  if(kind==='mobius'){
    const a=u*Math.PI*2,t=u*Math.PI,r=p.radius+v*p.width*.5*Math.cos(t);
    return out.set(r*Math.cos(a),r*Math.sin(a),v*p.width*.5*Math.sin(t));
  }
  const a=u*Math.PI*4,r=p.radius+v*p.width*.5,w=Math.sqrt(r/p.radius);
  return out.set(r*Math.cos(a)+p.fold*.22*w*Math.cos(a*.5),r*Math.sin(a),p.fold*w*Math.sin(a*.5));
}

export class RibbonGeometry extends THREE.BufferGeometry {
  private parameters:Float32Array;
  private tags:number[]=[];
  readonly kind:Ribbon;
  constructor(kind:Ribbon){
    super();this.kind=kind;const params:number[]=[],indices:number[]=[],rows=128,columns=8;
    const patch=(wall:number,side:number)=>{
      const start=params.length/3,cols=wall?1:columns;
      for(let r=0;r<=rows;r++)for(let c=0;c<=cols;c++){
        params.push(r/rows,wall||c/cols*2-1,wall?c*2-1:side);this.tags.push(wall?0:side);
      }
      for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
        const a=start+r*(cols+1)+c,b=a+cols+1;
        if((wall&&wall<0)||(!wall&&side>0))indices.push(a,b,a+1,a+1,b,b+1);
        else indices.push(a,a+1,b,a+1,b+1,b);
      }
    };
    patch(0,1);patch(0,-1);patch(-1,0);patch(1,0);
    this.parameters=new Float32Array(params);
    this.setAttribute('position',new THREE.BufferAttribute(new Float32Array(params.length),3).setUsage(THREE.DynamicDrawUsage));
    this.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(params.length),3).setUsage(THREE.DynamicDrawUsage));
    this.setIndex(indices);this.boundingSphere=new THREE.Sphere();
    this.updateDimensions({radius:.8,tube:.05,depth:1,width:.22,fold:.35});
  }
  updateDimensions(p:RingDimensions):void {
    const positions=this.getAttribute('position'),normals=this.getAttribute('normal');
    const point=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),du=new THREE.Vector3(),dv=new THREE.Vector3(),n=new THREE.Vector3(),wallNormal=new THREE.Vector3();
    const eps=.0001;
    for(let i=0;i<this.tags.length;i++){
      const u=this.parameters[i*3],v=this.parameters[i*3+1],side=this.parameters[i*3+2];
      ribbonMidPoint(this.kind,u,v,p,point);
      du.copy(ribbonMidPoint(this.kind,u+eps,v,p,a)).sub(ribbonMidPoint(this.kind,u-eps,v,p,b));
      dv.copy(ribbonMidPoint(this.kind,u,v+eps,p,a)).sub(ribbonMidPoint(this.kind,u,v-eps,p,b));
      n.crossVectors(du,dv).normalize();point.addScaledVector(n,side*p.tube*p.depth*.40);
      positions.setXYZ(i,point.x,point.y,point.z);
      if(this.tags[i])wallNormal.copy(n).multiplyScalar(this.tags[i]);
      else wallNormal.crossVectors(n,du).normalize().multiplyScalar(v);
      normals.setXYZ(i,wallNormal.x,wallNormal.y,wallNormal.z);
    }
    positions.needsUpdate=normals.needsUpdate=true;
    this.boundingSphere!.radius=p.radius+p.width+p.fold+p.tube*p.depth;
  }
}

export class RingSurfaceModel {
  readonly mesh=new THREE.Group();
  surfaceName:string='round';
  private uRadius={value:.8};private uTube={value:.05};private uDepth={value:1};
  private objects:THREE.Mesh[]=[];
  private ribbons:RibbonGeometry[]=[];
  private previous:number[]=[];
  constructor(gold:THREE.MeshPhysicalMaterial){
    const bandMaterial=(flat:boolean)=>{
      const material=gold.clone();material.flatShading=flat;
      material.onBeforeCompile=shader=>{
        Object.assign(shader.uniforms,{uRadius:this.uRadius,uTube:this.uTube,uDepth:this.uDepth});
        shader.vertexShader='uniform float uRadius,uTube,uDepth;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','vec3 transformed=vec3((position.xy-normal.xy)*uRadius+normal.xy*uTube,normal.z*uTube*uDepth);');
      };
      material.customProgramCacheKey=()=>flat?'floral-faceted-band-v1':'floral-solid-band-v1';
      return material;
    };
    const smooth=new THREE.Mesh(new THREE.TorusGeometry(1,1,16,128),bandMaterial(false));this.objects.push(smooth);
    const faceted=bandMaterial(true);
    for(let sides=5;sides<=12;sides++)this.objects.push(new THREE.Mesh(new THREE.TorusGeometry(1,1,6,sides),faceted));
    const ribbonMaterial=gold.clone();ribbonMaterial.side=THREE.DoubleSide;
    for(const kind of ['mobius','riemann'] as const){
      const geometry=new RibbonGeometry(kind);this.ribbons.push(geometry);this.objects.push(new THREE.Mesh(geometry,ribbonMaterial));
    }
    for(const object of this.objects){object.frustumCulled=false;object.visible=false;this.mesh.add(object);}
    smooth.visible=true;
  }
  update(surface:number,facets:number,p:RingDimensions):void {
    const style=Math.max(0,Math.min(3,Math.round(surface)));
    const selected=style===0?0:style===1?1+Math.max(0,Math.min(7,Math.round(facets)-5)):style===2?9:10;
    this.objects.forEach((object,i)=>{object.visible=i===selected;});this.surfaceName=RING_SURFACES[style];
    this.uRadius.value=p.radius;this.uTube.value=p.tube;this.uDepth.value=p.depth;
    const values=[p.radius,p.tube,p.depth,p.width,p.fold];
    if(values.some((v,i)=>Math.abs(v-(this.previous[i]??Infinity))>1e-5)){
      for(const ribbon of this.ribbons)ribbon.updateDimensions(p);this.previous=values;
    }
  }
}
