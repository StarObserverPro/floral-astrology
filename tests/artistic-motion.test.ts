import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { flowerAppearance, petalMaturity } from '../src/bloom.ts';
import { COLOR_ALGORITHMS, generateColors } from '../src/color.ts';
import { lightOrbits, ringPose } from '../src/lighting.ts';
import { morphologyFromProfile } from '../src/morphology.ts';
import { AtmosphereField } from '../src/atmosphere.ts';

const profile={outward:.625,dream:.375,softness:.875,freedom:.625};

test('the first opened corolla reserves most of its final dimensions for later answers',()=>{
  const values=[3,6,9,12].map(n=>petalMaturity(n/12));
  assert.ok(values[0]>.25&&values[0]<.4);
  assert.ok(values[1]>.5&&values[1]<.7);
  assert.ok(values[2]>.8&&values[2]<.95);
  assert.equal(values[3],1);
  assert.ok(values.every((v,i)=>i===0||v>values[i-1]));
});
test('the flower fades independently from its completed background',()=>{
  assert.equal(flowerAppearance(0),0);
  assert.ok(flowerAppearance(1)>.1&&flowerAppearance(1)<.5);
  assert.equal(flowerAppearance(3),1);
  assert.equal(flowerAppearance(0,true),1);
});
test('ring budgets remain sparse and crossed patterns have nonparallel normals',()=>{
  const counts=Array.from({length:200},(_,i)=>morphologyFromProfile(profile,i).ringCount);
  assert.ok(counts.every(n=>n>=0&&n<=2));assert.ok(counts.includes(0)&&counts.includes(2));
  const normal=(i:number)=>new THREE.Vector3(0,0,1).applyEuler(new THREE.Euler(...ringPose(1,i,0,.1,.6)));
  assert.ok(Math.abs(normal(0).dot(normal(1)))<.2);
  assert.notDeepEqual(ringPose(1,1,0,.1,.6),ringPose(1,1,30,.1,.6));
});
test('all three colour algorithms are reproducible, answer-driven and user-selectable',()=>{
  const results=COLOR_ALGORITHMS.map((_,i)=>generateColors(profile,21,0,i));
  assert.equal(new Set(results.map(c=>c.b)).size,3);
  assert.deepEqual(results[1],generateColors(profile,21,0,1));
  assert.notDeepEqual(results[1],generateColors({...profile,dream:.875},21,0,1));
  assert.notDeepEqual(results[1],generateColors(profile,21,2,1));
  for(const c of results)for(const hex of Object.values(c))assert.match(hex,/^#[0-9a-f]{6}$/);
});
test('actual emitters travel bounded slow orbits',()=>{
  const a=lightOrbits(0),b=lightOrbits(60);
  for(const key of ['key','rim','back','point'] as const) {
    assert.ok(a[key].every(Number.isFinite)&&b[key].every(Number.isFinite));
    const distance=new THREE.Vector3(...a[key]).distanceTo(new THREE.Vector3(...b[key]));
    assert.ok(distance>.1&&distance<10);
    assert.ok(a[key][1]>1&&b[key][1]>1);
  }
});
test('volumetric atmosphere is capped independently from the main render buffers',()=>{
  const field=new AtmosphereField();field.setSize(5000,4000);
  assert.ok(field.target.width*field.target.height<1_205_000);
  field.dispose();
});
