// Original flat botanical engraving. These paths are UI artwork, not painted
// bevels or a CSS imitation of the physically rendered crystal.
export function answerArt(index:number):string {
  const center=index===0
    ? '<path d="M38 13C23 22 23 35 38 44C53 35 53 22 38 13Z"/><path d="M38 16v25m0-22c-7 6-7 12 0 18m0-18c7 6 7 12 0 18"/>'
    : '<path d="M38 16C25 8 21 24 31 30C17 36 29 46 38 37C47 46 59 36 45 30C55 24 51 8 38 16Z"/><path d="M38 19v15m-9-12 9 12 9-12"/>';
  return `<svg class="answer-art" viewBox="0 0 76 58" fill="none" aria-hidden="true"><g class="art-wings"><path d="M29 17C16 12 12 30 3 29C11 40 20 43 30 39M47 17C60 12 64 30 73 29C65 40 56 43 46 39"/><path d="M24 21c-10 1-6 13-15 12m43-12c10 1 6 13 15 12M17 36c5 0 6-4 6-9m36 9c-5 0-6-4-6-9"/></g><g class="art-core">${center}</g><path d="m38 3 2 4-2 4-2-4Zm0 44 2 4-2 4-2-4Z"/><circle cx="5" cy="29" r="1.2"/><circle cx="71" cy="29" r="1.2"/></svg>`;
}
export function colorArt(index:number):string {
  const petals=Array.from({length:index+1},(_,i)=>`<path transform="rotate(${i*120} 16 16)" d="M16 4C7 11 8 20 16 24C24 20 25 11 16 4Z"/>`).join('');
  return `<svg viewBox="0 0 32 32" fill="none" aria-hidden="true">${petals}<circle cx="16" cy="16" r="2"/></svg>`;
}
