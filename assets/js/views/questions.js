import { getSubject, getQuestions } from '../content.js';
import { store } from '../store.js';
import { esc, md, mdInline, progressBar, pct } from '../utils.js';

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
      <div class="breadcrumbs"><a href="#/">Предметы</a> / <a href="#/s/${esc(s.id)}">${esc(s.title)}</a></div>
      <div class="page-head" style="margin-bottom:var(--s5)">
        <span class="label">Билеты</span>
        <h1>Вопросы к экзамену</h1>
        <div class="head-progress">${progressBar(pct(known, questions.length), `${known}/${questions.length}`)}</div>
      </div>
      <div class="toolbar">
        <div class="tabs" role="tablist">
          <button type="button" data-filter="all" class="${filter === 'all' ? 'active' : ''}">Все<span class="count">${questions.length}</span></button>
          ${STATUSES.map(([k, label]) => `<button type="button" data-filter="${k}" class="${filter === k ? 'active' : ''}">${label}<span class="count">${count(k)}</span></button>`).join('')}
          <button type="button" data-filter="none" class="${filter === 'none' ? 'active' : ''}">Без отметки<span class="count">${count('none')}</span></button>
        </div>
        <button class="btn sm" type="button" id="random">Случайный билет</button>
      </div>
      ${!questions.length ? '<div class="empty">Вопросов пока нет.</div>'
        : !visible.length ? '<div class="empty">В этой категории вопросов нет.</div>'
        : visible.map((q) => {
          const st = store.questionStatus(s.id, q.id);
          const stMeta = STATUSES.find(([k]) => k === st);
          return `<details class="qa" data-id="${esc(q.id)}" ${openId === q.id ? 'open' : ''}>
            <summary>
              <span class="row-num">${esc(String(q.id).padStart(2, '0'))}</span>
              <span class="grow"><span class="row-title" style="font-weight:500">${mdInline(q.q)}</span>${q.topic && topicTitle[q.topic] ? `<div class="row-sub">${esc(topicTitle[q.topic])}</div>` : ''}</span>
              ${stMeta ? `<span class="tag ${stMeta[2]}">${stMeta[1]}</span>` : ''}
              <span class="chev" aria-hidden="true">›</span>
            </summary>
            <div class="answer">
              ${q.a ? `<div class="prose">${md(q.a)}</div>` : '<p class="small muted">Ответ ещё не добавлен — подготовьте его сами и отметьте, насколько уверенно знаете.</p>'}
              ${q.topic && topicTitle[q.topic] ? `<p class="small" style="margin-top:var(--s3)"><a href="#/s/${esc(s.id)}/topic/${esc(q.topic)}">Открыть тему «${esc(topicTitle[q.topic])}»</a></p>` : ''}
              <div class="status-btns">
                ${STATUSES.map(([k, label, cls]) => `<button class="btn sm ${cls} ${st === k ? 'on' : ''}" type="button" data-set="${k}" data-q="${esc(q.id)}" aria-pressed="${st === k}">${label}</button>`).join('')}
              </div>
            </div>
          </details>`;
        }).join('')}
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
