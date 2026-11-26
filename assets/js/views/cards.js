import { getSubject, getFlashcards } from '../content.js';
import { store } from '../store.js';
import { esc, md, shuffle, progressBar, pct } from '../utils.js';

export async function renderCards(app, subjectId) {
  const s = await getSubject(subjectId);
  const cards = await getFlashcards(s);

  let mode = 'all';          // 'all' | 'unknown'
  let deck = [];
  let i = 0;
  let flipped = false;

  const known = () => cards.filter((c) => store.cardStatus(s.id, c.id) === 'known').length;

  function build(doShuffle = false) {
    deck = mode === 'unknown' ? cards.filter((c) => store.cardStatus(s.id, c.id) !== 'known') : cards.slice();
    if (doShuffle) deck = shuffle(deck);
    i = 0;
    flipped = false;
    draw();
  }

  function mark(status) {
    if (!deck[i]) return;
    store.setCardStatus(s.id, deck[i].id, status);
    i++;
    flipped = false;
    draw();
  }

  function draw() {
    const card = deck[i];
    const unknownCount = cards.length - known();
    const head = `
      <div class="breadcrumbs"><a href="#/">Предметы</a> / <a href="#/s/${esc(s.id)}">${esc(s.title)}</a></div>
      <div class="page-head" style="margin-bottom:var(--s5)">
        <span class="label">Карточки</span>
        <h1>Термины и формулы</h1>
        <div class="head-progress">${progressBar(pct(known(), cards.length), `${known()}/${cards.length}`)}</div>
      </div>
      <div class="toolbar">
        <div class="tabs" role="tablist">
          <button type="button" data-mode="all" class="${mode === 'all' ? 'active' : ''}">Все<span class="count">${cards.length}</span></button>
          <button type="button" data-mode="unknown" class="${mode === 'unknown' ? 'active' : ''}">Невыученные<span class="count">${unknownCount}</span></button>
        </div>
        <button class="btn sm" type="button" id="shuffle">Перемешать</button>
      </div>`;

    if (!cards.length) {
      app.innerHTML = head + '<div class="empty">Карточек пока нет.</div>';
    } else if (!card) {
      app.innerHTML = head + `
        <div class="sheet" style="max-width:640px">
          <span class="label">Колода пройдена</span>
          <h2 style="margin-top:var(--s2)">${deck.length ? `Просмотрено карточек: ${deck.length}` : 'Все карточки выучены'}</h2>
          <p class="muted">${unknownCount ? `Осталось невыученных: ${unknownCount}.` : 'Можно переходить к билетам.'}</p>
          <div class="btn-row">
            ${unknownCount && mode === 'all' ? '<button class="btn primary" type="button" id="only-unknown">Повторить невыученные</button>' : ''}
            <button class="btn ${unknownCount && mode === 'all' ? '' : 'primary'}" type="button" id="restart">Начать заново</button>
            <a class="btn quiet" href="#/s/${esc(s.id)}">К предмету</a>
          </div>
        </div>`;
    } else {
      const status = store.cardStatus(s.id, card.id);
      app.innerHTML = head + `
        <div class="small muted mono">${i + 1} / ${deck.length}${status ? ` · ${status === 'known' ? '<span style="color:var(--ok)">знаю</span>' : '<span style="color:var(--warn)">повторить</span>'}` : ''}</div>
        <div class="flashcard ${flipped ? 'flipped' : ''}" id="flashcard" role="button" tabindex="0" aria-label="Перевернуть карточку">
          <div class="flashcard-inner">
            <div class="flashcard-face front"><span class="label">Вопрос</span><div>${md(card.front)}</div></div>
            <div class="flashcard-face back"><span class="label">Ответ</span><div>${md(card.back)}</div></div>
          </div>
        </div>
        <div class="flashcard-actions">
          <button class="btn" type="button" id="prev" ${i === 0 ? 'disabled' : ''} aria-label="Предыдущая">←</button>
          <button class="btn" type="button" id="skip" aria-label="Следующая">→</button>
          <span class="spacer"></span>
          <button class="btn bad" type="button" id="again">Ещё раз</button>
          <button class="btn ok" type="button" id="known">Знаю</button>
        </div>
        <p class="hint"><kbd>Пробел</kbd> перевернуть · <kbd>1</kbd> ещё раз · <kbd>2</kbd> знаю · <kbd>←</kbd> <kbd>→</kbd> листать</p>`;
    }

    app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; build(); }));
    app.querySelector('#shuffle')?.addEventListener('click', () => build(true));
    app.querySelector('#restart')?.addEventListener('click', () => build());
    app.querySelector('#only-unknown')?.addEventListener('click', () => { mode = 'unknown'; build(); });
    app.querySelector('#flashcard')?.addEventListener('click', flip);
    app.querySelector('#again')?.addEventListener('click', () => mark('again'));
    app.querySelector('#known')?.addEventListener('click', () => mark('known'));
    app.querySelector('#prev')?.addEventListener('click', () => go(-1));
    app.querySelector('#skip')?.addEventListener('click', () => go(1));
  }

  function flip() {
    flipped = !flipped;
    app.querySelector('#flashcard')?.classList.toggle('flipped', flipped);
  }

  function go(d) {
    const n = i + d;
    if (n < 0 || n > deck.length) return;
    i = n;
    flipped = false;
    draw();
  }

  function onKey(e) {
    if (e.target.matches?.('input, textarea') || !deck[i]) return;
    if (e.key === ' ' || (e.key === 'Enter' && e.target.id === 'flashcard')) { e.preventDefault(); flip(); }
    else if (e.key === '1') mark('again');
    else if (e.key === '2') mark('known');
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
  }

  document.addEventListener('keydown', onKey);
  build();
  return () => document.removeEventListener('keydown', onKey);
}
