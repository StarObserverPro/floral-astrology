import * as THREE from 'three';

/** Background colour and participating air are independent of surface lighting.
 * The scattering integral receives the actual moving emitters; the sky palette
 * neither creates a lamp nor changes an object's illumination. */
export class AtmosphereField {
  readonly target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});
  private scene=new THREE.Scene();
  private camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  private material=new THREE.ShaderMaterial({
    depthTest:false,depthWrite:false,toneMapped:false,
    uniforms:{uDawn:{value:0},uTime:{value:0},uAspect:{value:1},
      uInverseProjection:{value:new THREE.Matrix4()},uCameraWorld:{value:new THREE.Matrix4()},
      uAreaPosition:{value:new THREE.Vector3()},uAreaDirection:{value:new THREE.Vector3()},uAreaColor:{value:new THREE.Color()},
      uPointPosition:{value:new THREE.Vector3()},uPointColor:{value:new THREE.Color()}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:/* glsl */`
      varying vec2 vUv;
      uniform float uDawn,uTime,uAspect;
      uniform mat4 uInverseProjection,uCameraWorld;
      uniform vec3 uAreaPosition,uAreaDirection,uAreaColor,uPointPosition,uPointColor;
      float phaseHG(float cosine){float g=.42;return (1.-g*g)/pow(max(.1,1.+g*g-2.*g*cosine),1.5);}
      void main(){
        vec2 q=(vUv-vec2(.5,.49))*vec2(uAspect,1.);
        float halo=exp(-dot(q,q)*3.5);
        vec3 night=mix(vec3(.010,.013,.029),vec3(.029,.034,.066),vUv.y)+halo*vec3(.045,.028,.064);
        vec3 dawn=mix(vec3(.69,.65,.61),vec3(.90,.86,.77),vUv.y)+halo*vec3(.12,.11,.12);
        vec3 sky=mix(night,dawn,uDawn);
        vec4 view=uInverseProjection*vec4(vUv*2.-1.,1.,1.);
        vec3 ray=normalize(mat3(uCameraWorld)*(view.xyz/view.w));
        vec3 origin=uCameraWorld[3].xyz;
        vec3 scatter=vec3(0.);
        // Low resolution, bounded integration. No shadow map is invented here;
        // the flower is drawn afterwards and retains its physical highlights.
        for(int i=0;i<24;i++){
          float distance=1.5+(float(i)+.5)*.65;
          vec3 p=origin+ray*distance;
          float mist=.010*exp(-dot(p.xz,p.xz)*.014)*exp(-pow((p.y-1.)*.18,2.));
          mist*=.82+.18*sin(p.x*.7+p.y*.5+uTime*.012)*sin(p.z*.46-p.y*.6);
          vec3 toArea=uAreaPosition-p;float da=length(toArea);
          vec3 incident=toArea/max(.01,da);
          float cone=smoothstep(.38,.96,dot(-incident,uAreaDirection));
          scatter+=uAreaColor*mist*cone*phaseHG(dot(incident,ray))/(1.+da*da*.18)*.65;
          vec3 toPoint=uPointPosition-p;float dp=length(toPoint);
          scatter+=uPointColor*mist*phaseHG(dot(normalize(toPoint),ray))/(1.+dp*dp*.55)*.25;
        }
        float vignette=smoothstep(.25,.95,length(q));
        gl_FragColor=vec4(sky*(1.-vignette*mix(.34,.10,uDawn))+scatter,1.);
      }
    `,
  });
  constructor(){this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material));this.target.texture.name='Floral.Atmosphere.ScatteredAir';}
  setSize(width:number,height:number):void {
    const ratio=Math.min(.5,Math.sqrt(1_200_000/Math.max(1,width*height)));
    this.target.setSize(Math.max(1,Math.ceil(width*ratio)),Math.max(1,Math.ceil(height*ratio)));
  }
  render(renderer:THREE.WebGLRenderer,camera:THREE.Camera,area:THREE.RectAreaLight,point:THREE.PointLight,dawn:number,time:number):void {
    camera.updateMatrixWorld();const u=this.material.uniforms;
    u.uDawn.value=dawn;u.uTime.value=time;u.uAspect.value=(camera as THREE.PerspectiveCamera).aspect;
    u.uInverseProjection.value.copy(camera.projectionMatrixInverse);u.uCameraWorld.value.copy(camera.matrixWorld);
    u.uAreaPosition.value.copy(area.position);u.uAreaDirection.value.set(0,.6,0).sub(area.position).normalize();
    u.uAreaColor.value.copy(area.color).multiplyScalar(area.intensity);
    u.uPointPosition.value.copy(point.position);u.uPointColor.value.copy(point.color).multiplyScalar(point.intensity);
    const previous=renderer.getRenderTarget();renderer.setRenderTarget(this.target);renderer.render(this.scene,this.camera);renderer.setRenderTarget(previous);
  }
  dispose():void {this.scene.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});this.material.dispose();this.target.dispose();}
}
