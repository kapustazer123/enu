import { getSubject, getQuestions } from '../content.js';
import { store } from '../store.js';
import { esc, md, mdInline, progressBar } from '../utils.js';

const STATUSES = [
  ['known', 'Знаю', 'ok'],
  ['review', 'Повторить', 'warn'],
  ['unknown', 'Не знаю', 'bad'],
];

export async function renderQuestions(app, subjectId) {
  const s = await getSubject(subjectId);
  const questions = await getQuestions(s);
  const topicTitle = Object.fromEntries(s.topics.map((t) => [t.id, t.title]));
  let filter = 'all';
  let openId = null;

  const count = (st) => questions.filter((q) => (store.questionStatus(s.id, q.id) || 'none') === st).length;

  function draw() {
    const visible = questions.filter((q) => filter === 'all' || (store.questionStatus(s.id, q.id) || 'none') === filter);
    const known = count('known');

    app.innerHTML = `
      <div class="breadcrumbs"><a href="#/">Предметы</a> / <a href="#/s/${esc(s.id)}">${esc(s.title)}</a> / Вопросы</div>
      <h1>🎓 Вопросы к экзамену</h1>
      ${progressBar(questions.length ? (known / questions.length) * 100 : 0, `знаю ${known} из ${questions.length}`)}
      <div class="toolbar" style="margin-top:14px">
        <div class="seg">
          <button data-filter="all" class="${filter === 'all' ? 'active' : ''}">Все (${questions.length})</button>
          ${STATUSES.map(([k, label]) => `<button data-filter="${k}" class="${filter === k ? 'active' : ''}">${label} (${count(k)})</button>`).join('')}
          <button data-filter="none" class="${filter === 'none' ? 'active' : ''}">Без отметки (${count('none')})</button>
        </div>
        <button class="btn sm" id="random">🎲 Случайный билет</button>
      </div>
      ${!questions.length ? '<div class="empty">Вопросов пока нет</div>'
        : !visible.length ? '<div class="empty">В этой категории вопросов нет</div>'
        : `<ul class="list">${visible.map((q) => {
          const st = store.questionStatus(s.id, q.id);
          const stMeta = STATUSES.find(([k]) => k === st);
          return `<li><details class="qa" data-id="${esc(q.id)}" ${openId === q.id ? 'open' : ''}>
            <summary>
              <span class="num">${esc(q.id)}.</span>
              <span class="grow">${mdInline(q.q)}${q.topic && topicTitle[q.topic] ? `<br><a class="small" href="#/s/${esc(s.id)}/topic/${esc(q.topic)}">📖 ${esc(topicTitle[q.topic])}</a>` : ''}</span>
              ${stMeta ? `<span class="badge ${stMeta[2]}">${stMeta[1]}</span>` : ''}
            </summary>
            <div class="answer">
              ${q.a ? `<div class="prose">${md(q.a)}</div>` : '<p class="muted small">Ответ ещё не добавлен — подготовьте его сами и отметьте статус.</p>'}
              <div class="status-btns">
                ${STATUSES.map(([k, label, cls]) => `<button class="btn sm ${st === k ? cls : ''}" data-set="${k}" data-q="${esc(q.id)}">${label}</button>`).join('')}
              </div>
            </div>
          </details></li>`;
        }).join('')}</ul>`}
    `;

    app.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.filter; draw(); }));
    app.querySelectorAll('[data-set]').forEach((b) => b.addEventListener('click', () => {
      const cur = store.questionStatus(s.id, b.dataset.q);
      store.setQuestionStatus(s.id, b.dataset.q, cur === b.dataset.set ? null : b.dataset.set);
      openId = b.dataset.q;
      draw();
    }));
    app.querySelectorAll('details.qa').forEach((d) => d.addEventListener('toggle', () => {
      if (d.open) openId = d.dataset.id;
      else if (openId === d.dataset.id) openId = null;
    }));
    app.querySelector('#random')?.addEventListener('click', () => {
      const pool = questions.filter((q) => store.questionStatus(s.id, q.id) !== 'known');
      const src = pool.length ? pool : questions;
      if (!src.length) return;
      const q = src[Math.floor(Math.random() * src.length)];
      filter = 'all';
      openId = q.id;
      draw();
      app.querySelector(`details.qa[data-id="${CSS.escape(q.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  draw();
}
