import { getSubject } from '../content.js';
import { subjectStats } from '../progress.js';
import { store } from '../store.js';
import { esc, md, formatDate, daysUntil, daysBadge, progressBar, pct } from '../utils.js';

export async function renderSubject(app, id) {
  const s = await getSubject(id);
  const st = await subjectStats(s);
  const days = daysUntil(s.exam?.date);

  app.innerHTML = `
    <div class="breadcrumbs"><a href="#/">Предметы</a></div>
    <div class="page-head" style="--subject:${esc(s.color || '')}">
      <span class="label">${esc(s.exam?.type || 'Экзамен')} · ${esc(formatDate(s.exam?.date))}</span>
      <h1>${esc(s.title)}</h1>
      <div class="meta">
        ${daysBadge(days)}
        ${s.exam?.place ? `<span>${esc(s.exam.place)}</span>` : ''}
        ${s.teacher ? `<span>${esc(s.teacher)}</span>` : ''}
      </div>
      ${s.description ? `<div class="lead" style="margin-top:var(--s4)">${md(s.description)}</div>` : ''}
      <div class="head-progress">${progressBar(st.readiness, `${st.readiness}% готов`)}</div>
    </div>

    <section class="section">
      <div class="section-head"><h2>Материалы</h2><span class="aside mono">${st.topics.done} из ${st.topics.total} изучено</span></div>
      ${s.topics.length ? `<ul class="rows">${s.topics.map((t, i) => {
        const done = store.isTopicDone(s.id, t.id);
        return `<li><a class="row" href="#/s/${esc(s.id)}/topic/${esc(t.id)}">
          <span class="row-num">${String(i + 1).padStart(2, '0')}</span>
          <span class="grow"><span class="row-title">${esc(t.title)}</span>${t.summary ? `<div class="row-sub">${esc(t.summary)}</div>` : ''}</span>
          <span class="row-end">${done ? '<span class="tick">✓ изучено</span>' : ''}</span>
        </a></li>`;
      }).join('')}</ul>` : '<div class="empty">Материалы ещё не добавлены.</div>'}
    </section>

    <section class="section">
      <div class="section-head"><h2>Квизы</h2>${st.quizzes.total ? `<span class="aside">средний лучший результат <span class="mono">${st.quizzes.avgBest}%</span></span>` : ''}</div>
      ${s.quizzes.length ? `<ul class="rows">${s.quizzes.map((q, i) => {
        const r = store.quizResult(s.id, q.id);
        const cls = !r ? '' : r.best >= 80 ? 'ok' : r.best >= 50 ? 'warn' : 'bad';
        return `<li><a class="row" href="#/s/${esc(s.id)}/quiz/${esc(q.id)}">
          <span class="row-num">К${i + 1}</span>
          <span class="grow"><span class="row-title">${esc(q.title)}</span>${q.description ? `<div class="row-sub">${esc(q.description)}</div>` : ''}</span>
          <span class="row-end">${r ? `<span class="tag ${cls}">лучший ${r.best}%</span>` : 'не пройден'}</span>
        </a></li>`;
      }).join('')}</ul>` : '<div class="empty">Квизов пока нет.</div>'}
    </section>

    <div class="sheet-grid">
      <a class="sheet" href="#/s/${esc(s.id)}/questions">
        <span class="label">Билеты</span>
        <h3>Вопросы к экзамену</h3>
        <p class="small muted">Ответы на билеты и отметки «знаю / повторить / не знаю».</p>
        ${st.questions.total ? progressBar(pct(st.questions.known, st.questions.total), `${st.questions.known}/${st.questions.total}`) : '<span class="small muted">Вопросов пока нет</span>'}
      </a>
      <a class="sheet" href="#/s/${esc(s.id)}/cards">
        <span class="label">Карточки</span>
        <h3>Термины и формулы</h3>
        <p class="small muted">Повторение по принципу «знаю / ещё раз».</p>
        ${st.cards.total ? progressBar(pct(st.cards.known, st.cards.total), `${st.cards.known}/${st.cards.total}`) : '<span class="small muted">Карточек пока нет</span>'}
      </a>
    </div>

    ${s.links.length ? `
      <section class="section">
        <div class="section-head"><h2>Ссылки</h2></div>
        <ul class="rows">${s.links.map((l) => `<li><a class="row" href="${esc(l.url)}" target="_blank" rel="noopener"><span class="grow row-title">${esc(l.title)}</span><span class="row-end">↗</span></a></li>`).join('')}</ul>
      </section>
    ` : ''}

    <div class="btn-row" style="margin-top:var(--s7)">
      <button class="btn quiet sm" id="reset" type="button">Сбросить прогресс по предмету</button>
    </div>
  `;

  app.querySelector('#reset').addEventListener('click', () => {
    if (confirm(`Сбросить весь прогресс по предмету «${s.title}»?`)) {
      store.resetSubject(s.id);
      renderSubject(app, id);
    }
  });
}
