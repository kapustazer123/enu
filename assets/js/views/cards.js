import { getSubject, getFlashcards } from '../content.js';
import { store } from '../store.js';
import { esc, md, shuffle, progressBar } from '../utils.js';

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
    const head = `
      <div class="breadcrumbs"><a href="#/">Предметы</a> / <a href="#/s/${esc(s.id)}">${esc(s.title)}</a> / Карточки</div>
      <h1>🃏 Карточки</h1>
      ${progressBar(cards.length ? (known() / cards.length) * 100 : 0, `знаю ${known()} из ${cards.length}`)}
      <div class="toolbar" style="margin-top:14px">
        <div class="seg">
          <button data-mode="all" class="${mode === 'all' ? 'active' : ''}">Все</button>
          <button data-mode="unknown" class="${mode === 'unknown' ? 'active' : ''}">Только невыученные</button>
        </div>
        <button class="btn sm" id="shuffle">🔀 Перемешать</button>
      </div>`;

    if (!cards.length) {
      app.innerHTML = head + '<div class="empty">Карточек пока нет</div>';
    } else if (!card) {
      app.innerHTML = head + `
        <div class="card" style="text-align:center">
          <h2 style="margin-top:0">Колода пройдена 🎉</h2>
          <p class="muted">${deck.length ? `Вы просмотрели ${deck.length} карточек.` : 'Все карточки отмечены как выученные.'}</p>
          <div class="btn-row" style="justify-content:center">
            <button class="btn primary" id="restart">Начать заново</button>
            <a class="btn" href="#/s/${esc(s.id)}">К предмету</a>
          </div>
        </div>`;
    } else {
      const status = store.cardStatus(s.id, card.id);
      app.innerHTML = head + `
        <div class="muted small">${i + 1} / ${deck.length} ${status ? `· <span class="badge ${status === 'known' ? 'ok' : 'warn'}">${status === 'known' ? 'знаю' : 'повторить'}</span>` : ''}</div>
        <div class="flashcard ${flipped ? 'flipped' : ''}" id="flashcard" role="button" tabindex="0" aria-label="Перевернуть карточку">
          <div class="flashcard-inner">
            <div class="flashcard-face front"><span class="face-label">Вопрос</span><div>${md(card.front)}</div></div>
            <div class="flashcard-face back"><span class="face-label">Ответ</span><div>${md(card.back)}</div></div>
          </div>
        </div>
        <p class="muted small" style="text-align:center">Нажмите на карточку или пробел, чтобы перевернуть</p>
        <div class="btn-row" style="justify-content:center">
          <button class="btn" id="prev" ${i === 0 ? 'disabled' : ''}>←</button>
          <button class="btn bad" id="again">Ещё раз</button>
          <button class="btn ok" id="known">Знаю</button>
          <button class="btn" id="skip">→</button>
        </div>
        <p class="muted small" style="text-align:center">Клавиши: пробел — перевернуть, 1 — «ещё раз», 2 — «знаю», ←/→ — листать</p>`;
    }

    app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; build(); }));
    app.querySelector('#shuffle')?.addEventListener('click', () => build(true));
    app.querySelector('#restart')?.addEventListener('click', () => build());
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
    if (e.key === ' ') { e.preventDefault(); flip(); }
    else if (e.key === '1') mark('again');
    else if (e.key === '2') mark('known');
    else if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
  }

  document.addEventListener('keydown', onKey);
  build();
  return () => document.removeEventListener('keydown', onKey);
}
