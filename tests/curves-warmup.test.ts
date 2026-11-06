import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { botanicalPath,botanicalPoint,ornamentPoint,ornamentPath,answerArt,buttonIcon } from '../src/art.ts';
import { ribbonMidPoint,knotCenterPoint,KnotGeometry,RibbonGeometry,RingSurfaceModel } from '../src/ring-surfaces.ts';
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
  for(let style=0;style<5;style++){
    ring.update(style,7,p);assert.equal(ring.mesh.children.filter(c=>c.visible).length,1);
    assert.deepEqual(ring.mesh.children,objects);
  }
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  ring.mesh.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);materials.add(o.material as THREE.Material);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());base.dispose();
});
test('rational leaves and Lissajous ornaments remain a single closed fitted stroke',()=>{
  for(const curve of [{kind:'descartes' as const},{kind:'lissajous' as const,frequencyX:3,frequencyY:2},{kind:'lissajous' as const,frequencyX:4,frequencyY:3}]){
    const a=ornamentPoint(0,curve),b=ornamentPoint(Math.PI*2,curve);
    for(const key of ['x','y','dx','dy'] as const)assert.ok(Math.abs(a[key]-b[key])<1e-9);
    for(let i=0;i<=128;i++){
      const p=ornamentPoint(i/128*Math.PI*2,curve);assert.ok(Object.values(p).every(Number.isFinite));
      if(curve.kind==='descartes'){
        const sum=(p.y+1)*1.5,x=(sum+p.x)/2,y=(sum-p.x)/2;
        assert.ok(Math.abs(x*x*x+y*y*y-3*x*y)<1e-10);
      }
    }
    const path=ornamentPath(curve);assert.equal((path.match(/M/g)??[]).length,1);assert.ok(path.endsWith('Z'));assert.ok(!/NaN|Infinity/.test(path));
    if(curve.kind==='lissajous'){
      const unique=new Set(Array.from({length:128},(_,i)=>{const p=ornamentPoint(i/128*Math.PI*2,curve);return `${p.x.toFixed(6)},${p.y.toFixed(6)}`;}));
      assert.ok(unique.size>100,'ornament must not collapse to a twice-retraced open arc');
    }
  }
  assert.notEqual(answerArt(0,0),answerArt(0,1));
});
test('twist parity, sheet count and connected knot winding vary without adding ring objects',()=>{
  const p={radius:.7,tube:.045,depth:1.2,width:.18,fold:.24};
  for(const twists of [-3,-2,-1,1,2,3]){
    const params={...p,twists};
    assert.ok(ribbonMidPoint('mobius',1,.6,params).distanceTo(ribbonMidPoint('mobius',0,twists%2?-.6:.6,params))<1e-8);
  }
  for(const sheets of [2,3]){
    const params={...p,sheets};
    assert.ok(ribbonMidPoint('riemann',0,.6,params).distanceTo(ribbonMidPoint('riemann',1,.6,params))<1e-8);
    assert.ok(ribbonMidPoint('riemann',0,.6,params).distanceTo(ribbonMidPoint('riemann',1/sheets,.6,params))>.1);
  }
  const geometry=new KnotGeometry();
  for(const winding of [3,5]){
    const params={...p,winding};geometry.updateDimensions(params);
    assert.ok(knotCenterPoint(0,params).distanceTo(knotCenterPoint(1,params))<1e-8);
    assert.ok(knotCenterPoint(0,params).distanceTo(knotCenterPoint(.5,params))>.1);
    assert.ok([...geometry.getAttribute('position').array].every(Number.isFinite));
    const normals=geometry.getAttribute('normal'),positions=geometry.getAttribute('position'),index=geometry.index!;
    for(let i=0;i<normals.count;i++)assert.ok(new THREE.Vector3().fromBufferAttribute(normals,i).length()>.99);
    const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),n=new THREE.Vector3();
    for(let i=0;i<index.count;i+=93){
      a.fromBufferAttribute(positions,index.getX(i));b.fromBufferAttribute(positions,index.getX(i+1));c.fromBufferAttribute(positions,index.getX(i+2));n.fromBufferAttribute(normals,index.getX(i));
      assert.ok(b.sub(a).cross(c.sub(a)).dot(n)>0,'solid knot faces point outwards');
    }
  }
  geometry.dispose();
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
