import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { botanicalPath,botanicalPoint,answerArt,buttonIcon } from '../src/art.ts';
import { ribbonMidPoint,RibbonGeometry,RingSurfaceModel } from '../src/ring-surfaces.ts';
import { prepareGpu } from '../src/warmup.ts';

test('botanical contours close with a continuous tangent and one uninterrupted stroke',()=>{
  for(const lobes of [1,2,3,4]){
    const c={cx:32,cy:32,rx:25,ry:25,lobes,amplitude:.12};
    const a=botanicalPoint(0,c),b=botanicalPoint(Math.PI*2,c);
    for(const key of ['x','y','dx','dy'] as const)assert.ok(Math.abs(a[key]-b[key])<1e-9);
    const path=botanicalPath(c);assert.equal((path.match(/M/g)??[]).length,1);assert.ok(path.endsWith('Z'));
  }
  assert.equal((answerArt(0).match(/<path/g)??[]).length,1);
  assert.equal((buttonIcon('').match(/<path/g)??[]).length,1);
});
test('twisted and double-sheet bands have finite solid geometry and matching seams',()=>{
  const p={radius:.6,tube:.04,depth:1,width:.17,fold:.26};
  assert.ok(ribbonMidPoint('mobius',1,.5,p).distanceTo(ribbonMidPoint('mobius',0,-.5,p))<1e-8);
  assert.ok(ribbonMidPoint('riemann',1,.5,p).distanceTo(ribbonMidPoint('riemann',0,.5,p))<1e-8);
  assert.ok(ribbonMidPoint('riemann',.5,.5,p).distanceTo(ribbonMidPoint('riemann',0,.5,p))>.05);
  for(const kind of ['mobius','riemann'] as const){
    const geometry=new RibbonGeometry(kind);geometry.updateDimensions(p);
    assert.ok([...geometry.getAttribute('position').array].every(Number.isFinite));
    const normals=geometry.getAttribute('normal');
    for(let i=0;i<normals.count;i++)assert.ok(new THREE.Vector3().fromBufferAttribute(normals,i).length()>.99);
    assert.ok(geometry.index!.count>1000);geometry.dispose();
  }
});
test('all metal variants are ready without replacing model resources',()=>{
  const base=new THREE.MeshPhysicalMaterial(),ring=new RingSurfaceModel(base);
  const objects=[...ring.mesh.children],p={radius:.5,tube:.05,depth:1,width:.2,fold:.3};
  for(let style=0;style<4;style++){
    ring.update(style,7,p);assert.equal(ring.mesh.children.filter(c=>c.visible).length,1);
    assert.deepEqual(ring.mesh.children,objects);
  }
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  ring.mesh.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);materials.add(o.material as THREE.Material);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());base.dispose();
});
test('warmup cannot expose a ready frame until GPU work finishes',async()=>{
  const events:string[]=[];let release:()=>void=()=>{};
  const fence=new Promise<void>(resolve=>{release=resolve;});
  const ready=prepareGpu({compile:async()=>{events.push('compile');},draw:()=>events.push('draw'),fence:()=>fence,restore:()=>events.push('restore')}).then(()=>events.push('ready'));
  await Promise.resolve();assert.deepEqual(events,['compile','draw']);
  release();await ready;assert.deepEqual(events,['compile','draw','restore','ready']);
});
test('failed preparation restores the hidden warmup pose before fallback',async()=>{
  let restored=false,drawn=false;
  await assert.rejects(prepareGpu({compile:async()=>{throw new Error('lost');},draw:()=>{drawn=true;},fence:async()=>{},restore:()=>{restored=true;}}));
  assert.equal(restored,true);assert.equal(drawn,false);
});
