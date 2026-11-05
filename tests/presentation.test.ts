import test from 'node:test';
import assert from 'node:assert/strict';
import { bloomStage, petalScale, revealTargets } from '../src/bloom.ts';
import { DEFAULT_VIEW, MAX_PITCH, MIN_PITCH, RotationState } from '../src/rotation.ts';
import { photoFilename } from '../src/photo.ts';

test('new structural layers unlock at answers 3, 6, 9 and 12', () => {
  for (let answered = 0; answered <= 12; answered++) {
    assert.equal(bloomStage(answered/12), Math.floor(answered/3));
    const targets = revealTargets(answered/12);
    assert.equal(targets.reduce((a,b) => a+b,0), Math.floor(answered/3));
  }
  assert.ok(petalScale(0,.2,0) > .4);
  assert.ok(petalScale(1,.2,0) < .01);
  assert.ok(petalScale(1,.5,1) > .99);
});

test('pointer travel rotates regardless of DPR; vertical tilt stays bounded', () => {
  const state = new RotationState(); state.begin();
  state.drag(100,10000,400,800);
  assert.ok(Math.abs(state.targetYaw-DEFAULT_VIEW.yaw-Math.PI/2) < 1e-8);
  assert.equal(state.targetPitch, MAX_PITCH);
  state.drag(0,-20000,400,800); assert.equal(state.targetPitch, MIN_PITCH);
});

test('automatic orbit pauses during a drag and resumes from the selected view', () => {
  const state = new RotationState(); state.begin();
  state.drag(80,0,400,800); const target = state.targetYaw;
  for (let i=0;i<120;i++) state.update(1/60,false);
  assert.equal(state.targetYaw,target);
  state.end(true);
  for (let i=0;i<150;i++) state.update(1/60,false);
  assert.equal(state.targetYaw,target);
  for (let i=0;i<90;i++) state.update(1/60,false);
  assert.ok(state.targetYaw > target);
});

test('reduced motion disables automatic orbit; reset takes the shortest turn', () => {
  const state = new RotationState();
  state.update(10,true); assert.equal(state.yaw,DEFAULT_VIEW.yaw);
  state.yaw = 20;
  state.reset(); assert.ok(Math.abs(state.targetYaw-state.yaw) <= Math.PI);
  assert.ok(Math.abs(Math.sin(state.targetYaw)-Math.sin(DEFAULT_VIEW.yaw)) < 1e-8);
});

test('photo filenames contain only a complete result, with no partial guess', () => {
  assert.equal(photoFilename('INFP'),'花间-INFP.png');
  assert.equal(photoFilename('IN··'),'花间-水晶花.png');
  assert.equal(photoFilename(),'花间-水晶花.png');
});
