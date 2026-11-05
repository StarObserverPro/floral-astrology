export type Axis = 'EI' | 'SN' | 'TF' | 'JP';
export type Trait = 'E' | 'I' | 'S' | 'N' | 'T' | 'F' | 'J' | 'P';
export type Choice = { text: string; trait: Trait };
export type Question = { id: string; axis: Axis; text: string; options: readonly [Choice, Choice] };
export type Answer = { questionId: string; trait: Trait };
export type FlowerProfile = { outward: number; dream: number; softness: number; freedom: number };

// Original short situational items. Inspired by the four preference pairs;
// neither the official MBTI inventory nor a reproduction of another site's items.
export const QUESTIONS: readonly Question[] = [
  { id: 'restore', axis: 'EI', text: '空闲的晚上，你更想怎样度过？', options: [
    { text: '约熟悉的人聚一聚', trait: 'E' }, { text: '安静做点自己的事', trait: 'I' },
  ] },
  { id: 'learn', axis: 'SN', text: '接触新事物，你习惯从哪里开始？', options: [
    { text: '看一个具体的例子', trait: 'S' }, { text: '理解背后的联系', trait: 'N' },
  ] },
  { id: 'advice', axis: 'TF', text: '朋友请你拿主意，你会先考虑？', options: [
    { text: '理由是否站得住脚', trait: 'T' }, { text: '对当事人有什么影响', trait: 'F' },
  ] },
  { id: 'outing', axis: 'JP', text: '去陌生的地方玩一天，你更喜欢？', options: [
    { text: '先定好几处想去的', trait: 'J' }, { text: '走到哪里再决定', trait: 'P' },
  ] },
  { id: 'idea', axis: 'EI', text: '一个想法还没成形时，你通常会？', options: [
    { text: '自己想清楚再开口', trait: 'I' }, { text: '说出来，边聊边想', trait: 'E' },
  ] },
  { id: 'story', axis: 'SN', text: '看完一个故事，你更容易回味？', options: [
    { text: '情节背后的寓意', trait: 'N' }, { text: '人物和场景的细节', trait: 'S' },
  ] },
  { id: 'disagreement', axis: 'TF', text: '和在意的人意见不同时，你往往先？', options: [
    { text: '理解彼此为什么在意', trait: 'F' }, { text: '把分歧的理由理清', trait: 'T' },
  ] },
  { id: 'change', axis: 'JP', text: '原来的安排临时变了，你自然会？', options: [
    { text: '看看多出了什么可能', trait: 'P' }, { text: '重新排一个合适的顺序', trait: 'J' },
  ] },
  { id: 'gathering', axis: 'EI', text: '来到不太熟悉的聚会，你通常会？', options: [
    { text: '找个人聊起来', trait: 'E' }, { text: '先听听大家在聊什么', trait: 'I' },
  ] },
  { id: 'explain', axis: 'SN', text: '听别人介绍一个计划，你更想先知道？', options: [
    { text: '具体准备怎样做', trait: 'S' }, { text: '还有哪些可能性', trait: 'N' },
  ] },
  { id: 'exception', axis: 'TF', text: '有人希望破例一次，你会先想？', options: [
    { text: '同样的标准是否适用', trait: 'T' }, { text: '他的处境有什么不同', trait: 'F' },
  ] },
  { id: 'pace', axis: 'JP', text: '没有硬性期限时，你更喜欢怎样做事？', options: [
    { text: '留些余地，边做边调整', trait: 'P' }, { text: '定好节点，一步步完成', trait: 'J' },
  ] },
];

const AXES: readonly Axis[] = ['EI', 'SN', 'TF', 'JP'];
const KEYS = ['outward', 'dream', 'softness', 'freedom'] as const;

export function profileFromAnswers(answers: readonly Answer[]): FlowerProfile {
  const values = AXES.map((axis, index) => {
    const items = answers.filter(a => axis.includes(a.trait));
    // One neutral prior prevents the first answer from jumping to an extreme.
    const positive = items.filter(a => a.trait === axis[index === 0 ? 0 : 1]).length;
    return (positive + 0.5) / (items.length + 1);
  });
  return Object.fromEntries(KEYS.map((key, i) => [key, values[i]])) as FlowerProfile;
}

export function resultType(answers: readonly Answer[]): string {
  return AXES.map(axis => {
    const left = answers.filter(a => a.trait === axis[0]).length;
    const right = answers.filter(a => a.trait === axis[1]).length;
    return left === right ? '·' : left > right ? axis[0] : axis[1];
  }).join('');
}

export function answerAt(answers: readonly Answer[], index: number, option: number): Answer[] {
  const question = QUESTIONS[index];
  const selected = question?.options[option];
  if (!question || !selected || index < 0 || index > answers.length) return [...answers];
  return [...answers.slice(0, index), { questionId: question.id, trait: selected.trait }];
}

export function flowerReading(profile: FlowerProfile): string {
  const focus = profile.outward > 0.5 ? '向外舒展，自有回响' : '向内盛放，自有天地';
  const form = profile.dream > 0.5 ? '在可能之间，留一点想象' : '把眼前的微光，握成真实';
  return `${focus}。${form}。`;
}
