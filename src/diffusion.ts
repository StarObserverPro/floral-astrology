import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

/** Optical diffusion in the rendered image only. UI remains unblurred. */
export class DiffusionPass extends Pass {
  amount=1;
  private dpr=1;
  private a=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});
  private b=this.a.clone();
  private blur=new THREE.ShaderMaterial({
    depthTest:false,depthWrite:false,toneMapped:false,
    uniforms:{tInput:{value:null},direction:{value:new THREE.Vector2()}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:/* glsl */`
      varying vec2 vUv;uniform sampler2D tInput;uniform vec2 direction;
      void main(){
        vec4 color=texture2D(tInput,vUv)*.227027;
        color+=(texture2D(tInput,vUv+direction*1.384615)+texture2D(tInput,vUv-direction*1.384615))*.316216;
        color+=(texture2D(tInput,vUv+direction*3.230769)+texture2D(tInput,vUv-direction*3.230769))*.070270;
        gl_FragColor=color;
      }
    `,
  });
  private composite=new THREE.ShaderMaterial({
    depthTest:false,depthWrite:false,toneMapped:false,
    uniforms:{tScene:{value:null},tSoft:{value:null},uAmount:{value:1}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:/* glsl */`
      varying vec2 vUv;uniform sampler2D tScene,tSoft;uniform float uAmount;
      void main(){vec4 scene=texture2D(tScene,vUv);vec3 soft=texture2D(tSoft,vUv).rgb;
        vec3 color=mix(scene.rgb,soft,.055*uAmount)+max(soft-scene.rgb*.75,vec3(0.))*.07*uAmount;
        gl_FragColor=vec4(color,scene.a);
      }
    `,
  });
  private quad=new FullScreenQuad(this.blur);
  setDpr(value:number):void {this.dpr=value;}
  setSize(width:number,height:number):void {this.a.setSize(Math.max(1,Math.ceil(width/2)),Math.max(1,Math.ceil(height/2)));this.b.setSize(this.a.width,this.a.height);}
  render(renderer:THREE.WebGLRenderer,write:THREE.WebGLRenderTarget,read:THREE.WebGLRenderTarget):void {
    this.quad.material=this.blur;
    this.blur.uniforms.tInput.value=read.texture;this.blur.uniforms.direction.value.set(1.4*this.dpr/read.width,0);
    renderer.setRenderTarget(this.a);this.quad.render(renderer);
    this.blur.uniforms.tInput.value=this.a.texture;this.blur.uniforms.direction.value.set(0,.7*this.dpr/this.a.height);
    renderer.setRenderTarget(this.b);this.quad.render(renderer);
    this.composite.uniforms.tScene.value=read.texture;this.composite.uniforms.tSoft.value=this.b.texture;this.composite.uniforms.uAmount.value=this.amount;
    this.quad.material=this.composite;renderer.setRenderTarget(this.renderToScreen?null:write);this.quad.render(renderer);
  }
  dispose():void {this.a.dispose();this.b.dispose();this.blur.dispose();this.composite.dispose();this.quad.dispose();}
}
