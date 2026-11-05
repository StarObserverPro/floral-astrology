import test from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, answerAt, profileFromAnswers, resultType } from '../src/quiz.ts';
import { approach, seededRandom, widthProfileAt } from '../src/math.ts';
import type { Answer } from '../src/quiz.ts';

function answersFor(type: string): Answer[] {
  return QUESTIONS.map(q => ({ questionId: q.id, trait: q.options.find(o => type.includes(o.trait))!.trait }));
}

test('twelve original items cover each axis three times and both directions', () => {
  assert.equal(QUESTIONS.length, 12);
  assert.equal(new Set(QUESTIONS.map(q => q.id)).size, 12);
  for (const axis of ['EI', 'SN', 'TF', 'JP']) {
    const group = QUESTIONS.filter(q => q.axis === axis);
    assert.equal(group.length, 3);
    for (const question of group) assert.equal([...new Set(question.options.map(o => o.trait))].sort().join(''), [...axis].sort().join(''));
  }
});

test('all sixteen profiles score by trait rather than option position', () => {
  for (const a of 'EI') for (const b of 'SN') for (const c of 'TF') for (const d of 'JP') {
    const type = a+b+c+d;
    assert.equal(resultType(answersFor(type)), type);
  }
  const inward = profileFromAnswers(answersFor('INTJ'));
  const outward = profileFromAnswers(answersFor('ESFP'));
  assert.ok(inward.outward < outward.outward);
  assert.ok(inward.dream > outward.dream);
  assert.ok(inward.softness < outward.softness);
  assert.ok(inward.freedom < outward.freedom);
});

test('rewriting an earlier choice discards subsequent answers', () => {
  const complete = answersFor('INTJ');
  const changed = answerAt(complete, 0, 0);
  assert.equal(changed.length, 1);
  assert.equal(changed[0].trait, 'E');
  assert.equal(complete.length, 12);
  assert.deepEqual(answerAt([], 4, 0), []);
});

test('unanswered dimensions stay neutral; no false initial personality', () => {
  assert.deepEqual(profileFromAnswers([]), { outward: .5, dream: .5, softness: .5, freedom: .5 });
  assert.equal(resultType([]), '····');
});

test('growth is frame-rate independent and retargets continuously without overshoot', () => {
  const oneStep = approach(.2, 1, 2);
  let sixtyHz = .2;
  for (let i = 0; i < 120; i++) sixtyHz = approach(sixtyHz, 1, 1/60);
  assert.ok(Math.abs(oneStep-sixtyHz) < 1e-10);
  assert.ok(oneStep > .67 && oneStep < .69);
  const afterNewAnswer = approach(oneStep, .4, 1/60);
  assert.ok(afterNewAnswer < oneStep && afterNewAnswer > .4);
  assert.equal(approach(.5, 1, 0), .5);
});

test('flower variation is reproducible and inherited width endpoints are bounded', () => {
  const a = seededRandom(21), b = seededRandom(21);
  for (let i = 0; i < 80; i++) assert.equal(a(), b());
  const profile = [.03,.6,1,.7,.01];
  assert.equal(widthProfileAt(profile, -1), .03);
  assert.equal(widthProfileAt(profile, .5), 1);
  assert.ok(Math.abs(widthProfileAt(profile, 2)-.01) < 1e-12);
});
