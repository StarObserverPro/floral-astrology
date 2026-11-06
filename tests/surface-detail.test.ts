import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { morphologyFromProfile } from '../src/morphology.ts';
import { petalSurface } from '../src/petal-surface.ts';
import { generateColors } from '../src/color.ts';
import { applyMetalFinish,metalUniforms } from '../src/metal.ts';

const profile={outward:.125,dream:.875,softness:.625,freedom:.875};

test('fold parameters alter real petal depth while retaining the flower outline',()=>{
  const m=morphologyFromProfile(profile,771),flat={...m,ruffle:0,pleatAmplitude:0,edgeCurl:0};
  let maxDepth=0;
  for(let t=0;t<=64;t++)for(let s=-16;s<=16;s++){
    const a=petalSurface(m,t/64,s/16),b=petalSurface(flat,t/64,s/16);
    assert.ok(a.every(Number.isFinite));assert.equal(a[0],b[0]);assert.equal(a[2],b[2]);
    maxDepth=Math.max(maxDepth,Math.abs(a[1]-b[1]));
    assert.ok(Math.abs(a[1]-b[1])<m.length*.35,'folds stay within the lamina envelope');
  }
  assert.ok(maxDepth>.045,'ruffles produce visible depth');
  for(const key of ['ruffleFrequency','ruffleSkew','ruffleEdge','pleatFrequency','pleatDirection','pleatSharpness','edgeCurl'] as const){
    const changed={...m,[key]:m[key]*.6+.08};
    const differences=[.27,.49,.73].flatMap(t=>[-.87,.35,.92].map(s=>Math.abs(petalSurface(m,t,s)[1]-petalSurface(changed,t,s)[1])));
    assert.ok(Math.max(...differences)>1e-5,key);
  }
  const top=petalSurface(m,.6,.7,1),bottom=petalSurface(m,.6,.7,-1);assert.ok(top[1]>bottom[1]);
});
test('multicolour metal is deterministic and responds to seed, palette and colour algorithm',()=>{
  const colors=generateColors(profile,77),metals=(c:ReturnType<typeof generateColors>)=>[c.metal,c.metalB,c.metalC];
  assert.equal(new Set(metals(colors)).size,3);
  assert.deepEqual(colors,generateColors(profile,77));
  for(const other of [generateColors(profile,78),generateColors(profile,77,2),generateColors(profile,77,0,2)])assert.notDeepEqual(metals(colors),metals(other));
});
test('metal finish preserves deformation hooks and leaves the physical metal BRDF in charge',()=>{
  const material=new THREE.MeshPhysicalMaterial({metalness:.94,roughness:.32});
  let priorRan=false;material.onBeforeCompile=shader=>{priorRan=true;shader.vertexShader='// deformation\n'+shader.vertexShader;};
  const uniforms=metalUniforms();applyMetalFinish(material,uniforms,.7);
  const shader={uniforms:{},vertexShader:'#include <begin_vertex>\n#include <project_vertex>',fragmentShader:'#include <color_fragment>'};
  material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0],{} as THREE.WebGLRenderer);
  assert.equal(priorRan,true);assert.ok(shader.vertexShader.includes('deformation'));
  assert.ok(shader.vertexShader.includes('vAlloyPosition=transformed'));
  assert.ok(shader.fragmentShader.includes('diffuseColor.rgb*=mix'));
  assert.equal(material.metalness,.94);assert.equal(material.roughness,.32);
  material.dispose();
});
