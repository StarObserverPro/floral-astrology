import * as THREE from 'three';

export const RING_SURFACES=['round','faceted','mobius','riemann','knot'] as const;
type Ribbon='mobius'|'riemann';
export type RingDimensions={radius:number;tube:number;depth:number;width:number;fold:number;twists?:number;sheets?:number;winding?:number};

/** The branched form projects (z,z^(1/n)) from four real coordinates into three.
 * Its parameter covers n full turns, joining the sheets around the branch.
 * This is a decorative projection, not an embedding of the full complex plane. */
export function ribbonMidPoint(kind:Ribbon,u:number,v:number,p:RingDimensions,out=new THREE.Vector3()):THREE.Vector3 {
  if(kind==='mobius'){
    const a=u*Math.PI*2,t=u*Math.PI*(p.twists??1),r=p.radius+v*p.width*.5*Math.cos(t);
    return out.set(r*Math.cos(a),r*Math.sin(a),v*p.width*.5*Math.sin(t));
  }
  const sheets=p.sheets??2,a=u*Math.PI*2*sheets,r=p.radius+v*p.width*.5,w=Math.pow(r/p.radius,1/sheets);
  return out.set(r*Math.cos(a)+p.fold*.22*w*Math.cos(a/sheets),r*Math.sin(a),p.fold*w*Math.sin(a/sheets));
}

/** One connected (2,3) or (2,5) torus knot, irrespective of its windings. */
export function knotCenterPoint(u:number,p:RingDimensions,out=new THREE.Vector3()):THREE.Vector3 {
  const t=u*Math.PI*2,q=p.winding??3,r=p.radius*(.72+.24*Math.cos(q*t));
  return out.set(r*Math.cos(2*t),r*Math.sin(2*t),p.radius*.24*Math.sin(q*t));
}

export class KnotGeometry extends THREE.BufferGeometry {
  constructor(){
    super();const rows=192,cols=12,indices:number[]=[];
    this.setAttribute('position',new THREE.BufferAttribute(new Float32Array((rows+1)*(cols+1)*3),3).setUsage(THREE.DynamicDrawUsage));
    this.setAttribute('normal',new THREE.BufferAttribute(new Float32Array((rows+1)*(cols+1)*3),3).setUsage(THREE.DynamicDrawUsage));
    for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
      const a=r*(cols+1)+c,b=a+cols+1;indices.push(a,a+1,b,a+1,b+1,b);
    }
    this.setIndex(indices);this.boundingSphere=new THREE.Sphere();
    this.updateDimensions({radius:.8,tube:.05,depth:1,width:.2,fold:.3,winding:3});
  }
  updateDimensions(p:RingDimensions):void {
    const positions=this.getAttribute('position'),normals=this.getAttribute('normal'),rows=192,cols=12;
    // Preserve an embedded tube while a young flower's ring is still small.
    const tube=Math.min(p.tube,p.radius*((p.winding??3)===5?.075:.12)/Math.max(1,p.depth));
    const center=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),tangent=new THREE.Vector3(),normal=new THREE.Vector3(),binormal=new THREE.Vector3(),v=new THREE.Vector3();
    for(let r=0;r<=rows;r++){
      const u=r/rows;knotCenterPoint(u,p,center);
      tangent.copy(knotCenterPoint(u+.00001,p,a)).sub(knotCenterPoint(u-.00001,p,b)).normalize();
      normal.set(Math.cos(u*Math.PI*4),Math.sin(u*Math.PI*4),0).addScaledVector(tangent,-normal.dot(tangent)).normalize();
      binormal.crossVectors(tangent,normal).normalize();
      for(let c=0;c<=cols;c++){
        const t=c/cols*Math.PI*2,i=r*(cols+1)+c,co=Math.cos(t),si=Math.sin(t);
        v.copy(center).addScaledVector(normal,tube*co).addScaledVector(binormal,tube*p.depth*si);
        positions.setXYZ(i,v.x,v.y,v.z);
        v.copy(normal).multiplyScalar(co).addScaledVector(binormal,si/p.depth).normalize();normals.setXYZ(i,v.x,v.y,v.z);
      }
    }
    positions.needsUpdate=normals.needsUpdate=true;
    this.boundingSphere!.radius=p.radius*1.25+p.tube*Math.max(1,p.depth);
  }
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
  private knot=new KnotGeometry();
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
    this.objects.push(new THREE.Mesh(this.knot,gold.clone()));
    for(const object of this.objects){object.frustumCulled=false;object.visible=false;this.mesh.add(object);}
    smooth.visible=true;
  }
  update(surface:number,facets:number,p:RingDimensions):void {
    const style=Math.max(0,Math.min(4,Math.round(surface)));
    const selected=style===0?0:style===1?1+Math.max(0,Math.min(7,Math.round(facets)-5)):style+7;
    this.objects.forEach((object,i)=>{object.visible=i===selected;});this.surfaceName=RING_SURFACES[style];
    this.uRadius.value=p.radius;this.uTube.value=p.tube;this.uDepth.value=p.depth;
    const values=[style,p.radius,p.tube,p.depth,p.width,p.fold,p.twists??1,p.sheets??2,p.winding??3];
    if(values.some((v,i)=>Math.abs(v-(this.previous[i]??Infinity))>1e-5)){
      if(style===2||style===3)this.ribbons[style-2].updateDimensions(p);
      if(style===4)this.knot.updateDimensions(p);
      this.previous=values;
    }
  }
}
