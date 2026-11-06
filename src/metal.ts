import * as THREE from 'three';

export function metalUniforms(){
  return {uMetalA:{value:new THREE.Color()},uMetalB:{value:new THREE.Color()},uMetalC:{value:new THREE.Color()},uMetalBalance:{value:.6},uMetalPattern:{value:1}};
}
export type MetalUniforms=ReturnType<typeof metalUniforms>;

/** A real metallic BRDF with a spatial alloy tint; no time-dependent rainbow. */
export function applyMetalFinish(material:THREE.MeshPhysicalMaterial,uniforms:MetalUniforms,phase:number):void {
  const compile=material.onBeforeCompile,cache=material.customProgramCacheKey();
  material.color.set('#ffffff');
  material.onBeforeCompile=function(shader,renderer){
    compile.call(this,shader,renderer);
    Object.assign(shader.uniforms,uniforms,{uMetalPhase:{value:phase}});
    shader.vertexShader='varying vec3 vAlloyPosition;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','vAlloyPosition=transformed;\n#include <project_vertex>');
    shader.fragmentShader='varying vec3 vAlloyPosition; uniform vec3 uMetalA,uMetalB,uMetalC; uniform float uMetalBalance,uMetalPattern,uMetalPhase;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',/* glsl */`
      #include <color_fragment>
      vec3 alloy=vAlloyPosition;
      float tint=.5+.5*sin(alloy.x*2.4+alloy.z*1.6+uMetalPhase);
      if(uMetalPattern<.5) tint=clamp(length(alloy.xy)*.58+uMetalPhase*.12,0.0,1.0);
      float alloyAngle=length(alloy.xy)>.00001?atan(alloy.y,alloy.x):0.0;
      if(uMetalPattern>1.5) tint=.5+.5*sin(alloyAngle*3.0+alloy.z+uMetalPhase);
      vec3 alloyColor=mix(uMetalA,uMetalB,smoothstep(.12,.88,tint)*uMetalBalance);
      float silver=smoothstep(.58,.96,.5+.5*sin(alloy.y*1.7-alloy.z+uMetalPhase+1.4));
      diffuseColor.rgb*=mix(alloyColor,uMetalC,silver*uMetalBalance*.68);
    `);
  };
  material.customProgramCacheKey=()=>cache+'|floral-alloy-v1';
}
