import './style.css';
import { FlowerScene, PALETTES } from './flower.ts';
import { FlowerFallback } from './flower-fallback.ts';
import { PhotoDialog } from './photo.ts';
import { QUESTIONS, answerAt, flowerReading, profileFromAnswers, resultType } from './quiz.ts';
import type { Answer } from './quiz.ts';
import { shapeSeedFromAnswers } from './morphology.ts';

const app = document.querySelector<HTMLElement>('#app')!;
const sun = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="3.7"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const moon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20.5 14a8.5 8.5 0 0 1-10.5-10.5A8.5 8.5 0 1 0 20.5 14Z"/><path d="m17 3 .5 1.5L19 5l-1.5.5L17 7l-.5-1.5L15 5l1.5-.5Z"/></svg>';
const back = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>';
const again = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 10a8 8 0 1 1 .8 6.1M4 4v6h6"/></svg>';
const camera = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 6l1.5-3h5L16 6h5v15H3V6Z"/><circle cx="12" cy="13" r="4"/></svg>';
const orbit = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><ellipse cx="12" cy="12" rx="9" ry="4.5" transform="rotate(-22 12 12)"/><path d="m15 3 4 1-1 4M8 21l-4-1 1-4"/><path d="M12 8v8"/></svg>';

app.innerHTML = `
  <div id="scene" aria-busy="true"></div>
  <nav class="quiet-controls" aria-label="画面">
    <button id="back" class="icon-button back-button" aria-label="上一题" hidden>${back}</button>
    <button id="theme" class="icon-button theme-button" aria-label="切换到晨曦" aria-pressed="false">${sun}</button>
  </nav>
  <section id="question-area" aria-labelledby="question">
    <div id="question-copy" class="question-copy" aria-live="polite" aria-atomic="true">
      <h1 id="question"></h1>
      <p id="reading" class="reading" hidden></p>
    </div>
    <div id="choices" class="choices" role="group" aria-labelledby="question"></div>
  </section>
  <div class="palette" role="group" aria-label="水晶颜色">
    ${PALETTES.map((palette, index) => `<button class="palette-button" data-palette="${index}" aria-label="${palette.name}" aria-pressed="${index === 0}" style="--gem-color:${palette.gem}"><span class="palette-gem" aria-hidden="true"></span></button>`).join('')}
  </div>
  <div id="progress" class="progress" role="progressbar" aria-label="答题进度" aria-valuemin="0" aria-valuemax="12" aria-valuenow="0">
    ${QUESTIONS.map((_, index) => `<span data-step="${index}" aria-hidden="true"></span>`).join('')}
  </div>
  <button id="restart" class="icon-button restart-button" aria-label="再开一朵" hidden>${again}</button>
  <div class="view-controls" role="group" aria-label="观看花朵">
    <button id="reset-view" class="icon-button" aria-label="恢复默认视角" disabled>${orbit}</button>
    <button id="camera" class="icon-button" aria-label="拍照" disabled>${camera}</button>
  </div>
`;

const sceneElement = document.querySelector<HTMLElement>('#scene')!;
let scene: FlowerScene | FlowerFallback | undefined;
let answers: Answer[] = [];
let questionIndex = 0;
let busy = false;
let transitionTimer: ReturnType<typeof setTimeout> | undefined;
let theme: 'night' | 'dawn' = 'night';

const question = document.querySelector<HTMLElement>('#question')!;
const questionCopy = document.querySelector<HTMLElement>('#question-copy')!;
const choices = document.querySelector<HTMLElement>('#choices')!;
const backButton = document.querySelector<HTMLButtonElement>('#back')!;
const themeButton = document.querySelector<HTMLButtonElement>('#theme')!;
const restartButton = document.querySelector<HTMLButtonElement>('#restart')!;
const reading = document.querySelector<HTMLElement>('#reading')!;
const progress = document.querySelector<HTMLElement>('#progress')!;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const cameraButton = document.querySelector<HTMLButtonElement>('#camera')!;
const viewButton = document.querySelector<HTMLButtonElement>('#reset-view')!;
const photos = new PhotoDialog(app, () => scene, () => ({
  type: answers.length === QUESTIONS.length ? resultType(answers) : undefined, theme,
}));
cameraButton.addEventListener('click', () => { void photos.open(cameraButton); });
viewButton.addEventListener('click', () => scene?.resetView());

function updateProgress(): void {
  progress.setAttribute('aria-valuenow', String(answers.length));
  for (const dot of progress.children) {
    const index = Number((dot as HTMLElement).dataset.step);
    dot.classList.toggle('done', index < answers.length);
    dot.classList.toggle('current', index === questionIndex);
  }
}

function renderQuestion(focus = false): void {
  const complete = questionIndex >= QUESTIONS.length;
  document.documentElement.dataset.complete = String(complete);
  question.classList.toggle('result-type', complete);
  reading.hidden = !complete;
  restartButton.hidden = !complete;
  backButton.hidden = questionIndex === 0;
  choices.hidden = complete;
  if (complete) {
    question.textContent = resultType(answers);
    reading.textContent = flowerReading(profileFromAnswers(answers));
    question.setAttribute('aria-label', `你的倾向是 ${resultType(answers).split('').join(' ')}`);
    if (focus) restartButton.focus({ preventScroll: true });
  } else {
    const current = QUESTIONS[questionIndex];
    question.removeAttribute('aria-label');
    const [first, ...rest] = current.text.split('，');
    if (rest.length) {
      const opening = document.createElement('span');
      opening.className = 'question-opening';
      opening.textContent = first+'，';
      question.replaceChildren(opening, document.createTextNode(rest.join('，')));
    } else question.textContent = current.text;
    choices.replaceChildren(...current.options.map((option, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'answer';
      button.dataset.answer = String(index);
      button.innerHTML = '<span class="answer-gem" aria-hidden="true"><span class="facet"></span></span><span class="answer-label"></span>';
      button.querySelector('.answer-label')!.textContent = option.text;
      button.addEventListener('click', () => choose(index, button));
      return button;
    }));
    if (focus) choices.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
  }
  updateProgress();
}

function transition(next: () => void, focus = false): void {
  busy = true;
  questionCopy.classList.add('leaving');
  choices.classList.add('leaving');
  backButton.disabled = true;
  transitionTimer = setTimeout(() => {
    next();
    renderQuestion(focus);
    questionCopy.classList.remove('leaving');
    choices.classList.remove('leaving');
    backButton.disabled = false;
    busy = false;
  }, reducedMotion ? 0 : 310);
}

function choose(index: number, button?: HTMLButtonElement): void {
  if (busy || questionIndex >= QUESTIONS.length) return;
  const keyboard = button?.matches(':focus-visible') ?? false;
  button?.classList.add('chosen');
  answers = answerAt(answers, questionIndex, index);
  scene?.setProfile(profileFromAnswers(answers), answers.length / QUESTIONS.length, false, shapeSeedFromAnswers(answers));
  transition(() => { questionIndex++; }, keyboard);
}

backButton.addEventListener('click', () => {
  if (busy || questionIndex <= 0) return;
  const keyboard = backButton.matches(':focus-visible');
  transition(() => {
    questionIndex--;
    answers = answers.slice(0, questionIndex);
    scene?.setProfile(profileFromAnswers(answers), answers.length / QUESTIONS.length, false, shapeSeedFromAnswers(answers));
  }, keyboard);
});

themeButton.addEventListener('click', () => {
  theme = theme === 'night' ? 'dawn' : 'night';
  document.documentElement.dataset.theme = theme;
  themeButton.innerHTML = theme === 'night' ? sun : moon;
  themeButton.setAttribute('aria-label', theme === 'night' ? '切换到晨曦' : '切换到夜晚');
  themeButton.setAttribute('aria-pressed', String(theme === 'dawn'));
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'night' ? '#111322' : '#e7dfd2');
  scene?.setTheme(theme);
});

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-palette]')) {
  button.addEventListener('click', () => {
    const index = Number(button.dataset.palette);
    scene?.setPalette(index);
    for (const peer of document.querySelectorAll('[data-palette]')) peer.setAttribute('aria-pressed', String(peer === button));
    document.documentElement.style.setProperty('--chosen-gem', PALETTES[index].gem);
  });
}

restartButton.addEventListener('click', () => {
  if (busy) return;
  const keyboard = restartButton.matches(':focus-visible');
  transition(() => {
    answers = []; questionIndex = 0;
    scene?.setProfile(profileFromAnswers(answers), 0, true, shapeSeedFromAnswers(answers));
  }, keyboard);
});

const qaParams = new URLSearchParams(location.search);
const specimen = qaParams.has('qa') ? qaParams.get('specimen') : null;
if (specimen && /^[EI][SN][TF][JP]$/.test(specimen)) {
  const count = Math.max(0, Math.min(12, Number(qaParams.get('answered') ?? 12) || 0));
  answers = QUESTIONS.slice(0, count).map(q => ({ questionId: q.id, trait: q.options.find(o => specimen.includes(o.trait))!.trait }));
  questionIndex = count;
}
renderQuestion();
document.documentElement.dataset.theme = theme;

// The question remains usable while the GPU warms up. Font or graphics support
// never blocks answering, and no account, API key, or stored quiz is involved.
requestAnimationFrame(() => {
  try {
    scene = new FlowerScene(sceneElement);
    scene.setProfile(profileFromAnswers(answers), answers.length / QUESTIONS.length, false, shapeSeedFromAnswers(answers));
    sceneElement.setAttribute('aria-busy', 'false');
  } catch (error) {
    console.warn('WebGL is unavailable; using the canvas flower.', error);
    sceneElement.setAttribute('aria-busy', 'false');
    scene = new FlowerFallback(sceneElement);
    scene.setProfile(profileFromAnswers(answers), answers.length / QUESTIONS.length, false, shapeSeedFromAnswers(answers));
    scene.setTheme(theme, true);
  }
  cameraButton.disabled = false;
  viewButton.disabled = false;
});

sceneElement.addEventListener('flower-context-lost', () => { document.documentElement.dataset.rendered = 'false'; });
sceneElement.addEventListener('flower-context-restored', () => { document.documentElement.dataset.rendered = 'true'; });

if (new URLSearchParams(location.search).has('qa')) {
  Object.defineProperty(window, '__QA_STATE__', { configurable: true, get: () => ({
    index: questionIndex, total: QUESTIONS.length, answers: answers.map(a => ({ ...a })),
    type: resultType(answers), theme, busy, ...scene?.diagnostics(),
  }) });
}

if (import.meta.hot) import.meta.hot.dispose(() => {
  if (transitionTimer) clearTimeout(transitionTimer);
  photos.dispose();
  scene?.dispose();
});
