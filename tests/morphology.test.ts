import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { QUESTIONS, profileFromAnswers } from '../src/quiz.ts';
import { FlowerModel } from '../src/flower-model.ts';
import { MORPHOLOGY_KEYS, MORPHOLOGY_LIMITS, dominantFamily, morphologyFromProfile, petalOutline, ringCenter, shapeSeedFromAnswers, totalPetalCount } from '../src/morphology.ts';
import { renderScale, supportedSamples } from '../src/render-quality.ts';

const answersFor=(type:string)=>QUESTIONS.map(q=>({questionId:q.id,trait:q.options.find(o=>type.includes(o.trait))!.trait}));
const specimen=(type:string)=>morphologyFromProfile(profileFromAnswers(answersFor(type)),shapeSeedFromAnswers(answersFor(type)));

test('real answer extremes reach sparse, dense, elongated and unequal four-petal silhouettes',()=>{
  const peach=specimen('ESTJ'),peony=specimen('INFP'),magnolia=specimen('ISTJ'),veronica=specimen('ENFP');
  assert.equal(dominantFamily(profileFromAnswers(answersFor('ESTJ'))),'peach');
  assert.equal(totalPetalCount(peach),5);
  assert.ok(totalPetalCount(peony)>=75);
  assert.equal(totalPetalCount(magnolia),10);
  assert.equal(totalPetalCount(veronica),4);
  assert.ok(magnolia.length/magnolia.width>3.5);
  assert.ok(veronica.length/veronica.width<1.7);
  assert.ok(magnolia.thickness>veronica.thickness*3);
  assert.ok(peony.ruffle>peach.ruffle*8);
  assert.ok(veronica.asymmetry>.3);
  assert.notDeepEqual(petalOutline(peach,.8,1),petalOutline(magnolia,.8,1));
  // A 2:1 majority must already produce a recognisable family, not only a
  // unanimous vote on both axes. Keep the four endpoints visually far apart.
  const mild=(e:number,n:number)=>morphologyFromProfile({outward:e,dream:n,softness:.5,freedom:.5},7);
  assert.ok(totalPetalCount(mild(.375,.625))>totalPetalCount(mild(.625,.375))*9);
  assert.ok(mild(.375,.375).length/mild(.375,.375).width>3);
  assert.equal(totalPetalCount(mild(.625,.625)),4);
});

test('all dimensions remain finite and within capacity across every scoring combination',()=>{
  for(const outward of [.125,.375,.625,.875])for(const dream of [.125,.375,.625,.875])for(const softness of [.125,.875])for(const freedom of [.125,.875]) {
    const m=morphologyFromProfile({outward,dream,softness,freedom},Math.round(outward*dream*1e6));
    for(const key of MORPHOLOGY_KEYS) {
      const [min,max]=MORPHOLOGY_LIMITS[key];
      assert.ok(Number.isFinite(m[key])&&m[key]>=min&&m[key]<=max,`${key}: ${m[key]}`);
    }
    for(let i=0;i<=20;i++) for(const s of [-1,0,1]) assert.ok(petalOutline(m,i/20,s).every(Number.isFinite));
  }
});

test('seeded dimensions are reproducible and affect the whole metal assembly',()=>{
  const profile=profileFromAnswers(answersFor('ESTJ')),a=morphologyFromProfile(profile,1),b=morphologyFromProfile(profile,2);
  assert.deepEqual(a,morphologyFromProfile(profile,1));
  for(const key of ['stemLength','stemRadius','ringRadius','ringThickness','calyxThickness'] as const)assert.notEqual(a[key],b[key]);
  assert.ok(['stemCount','ringCount','pendantCount','calyxCount'].some(key=>a[key as keyof typeof a]!==b[key as keyof typeof b]));
  assert.deepEqual(ringCenter(a),[0,.16-a.stemLength,0]);
  assert.notEqual(shapeSeedFromAnswers(answersFor('ESTJ')),shapeSeedFromAnswers(answersFor('ISTJ')));
});

test('physical rings keep one centre throughout independent motion and retargeting',()=>{
  const model=new FlowerModel(),a=new THREE.Color('#d7c2f4'),b=new THREE.Color('#8ed9da');
  for(const type of ['ESTJ','INFP']) {
    const answers=answersFor(type);model.setProfile(profileFromAnswers(answers),shapeSeedFromAnswers(answers));
    for(let i=0;i<12;i++) {
      model.update(.1,i*3,.6,[1,1,1,1],a,b);
      assert.equal(model.diagnostics().ringCentersCoincide,true);
    }
  }
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  model.root.traverse(o=>{if(o instanceof THREE.Mesh){geometries.add(o.geometry);(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>materials.add(m));if(o instanceof THREE.InstancedMesh)o.dispose();}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
});

test('AA selects a supported HDR sample level and supersamples ordinary desktop screens',()=>{
  assert.equal(supportedSamples([4],2),4);
  assert.equal(supportedSamples([8,4,2],4),4);
  assert.equal(supportedSamples([],4),0);
  assert.equal(renderScale(1528,682,1),1.6);
  assert.equal(renderScale(390,844,3),2.75);
  assert.ok(renderScale(3840,2160,2)**2*3840*2160<=6_500_001);
});
