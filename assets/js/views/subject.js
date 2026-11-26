import { getSubject } from '../content.js';
import { subjectStats } from '../progress.js';
import { store } from '../store.js';
import { esc, md, formatDate, daysUntil, daysBadge, progressBar } from '../utils.js';

export async function renderSubject(app, id) {
  const s = await getSubject(id);
  const st = await subjectStats(s);
  const days = daysUntil(s.exam?.date);

  app.innerHTML = `
    <div class="breadcrumbs"><a href="#/">Предметы</a> / ${esc(s.title)}</div>
    <div class="card subject-card" style="--subject:${esc(s.color || 'var(--accent)')}">
      <h1>${esc(s.title)}</h1>
      <div class="card-meta">
        <span>${esc(s.exam?.type || 'Экзамен')}: ${esc(formatDate(s.exam?.date))}</span>
        ${s.exam?.place ? `<span>📍 ${esc(s.exam.place)}</span>` : ''}
        ${s.teacher ? `<span>👤 ${esc(s.teacher)}</span>` : ''}
        ${daysBadge(days)}
      </div>
      ${s.description ? `<div>${md(s.description)}</div>` : ''}
      ${progressBar(st.readiness, `готовность ${st.readiness}%`)}
    </div>

    <div class="section-head"><h2>📖 Материалы</h2><span class="muted small">${st.topics.done}/${st.topics.total} изучено</span></div>
    ${s.topics.length ? `<ul class="list">${s.topics.map((t, i) => `
      <li><a class="list-item" href="#/s/${esc(s.id)}/topic/${esc(t.id)}">
        <span class="check ${store.isTopicDone(s.id, t.id) ? 'done' : ''}">${store.isTopicDone(s.id, t.id) ? '✓' : ''}</span>
        <span class="grow"><strong>${i + 1}. ${esc(t.title)}</strong>${t.summary ? `<br><span class="muted small">${esc(t.summary)}</span>` : ''}</span>
      </a></li>`).join('')}</ul>` : '<div class="empty">Материалы ещё не добавлены</div>'}

    <div class="section-head"><h2>✅ Квизы</h2>${st.quizzes.total ? `<span class="muted small">средний лучший результат ${st.quizzes.avgBest}%</span>` : ''}</div>
    ${s.quizzes.length ? `<ul class="list">${s.quizzes.map((q) => {
      const r = store.quizResult(s.id, q.id);
      const cls = !r ? '' : r.best >= 80 ? 'ok' : r.best >= 50 ? 'warn' : 'bad';
      return `<li><a class="list-item" href="#/s/${esc(s.id)}/quiz/${esc(q.id)}">
        <span class="grow"><strong>${esc(q.title)}</strong>${q.description ? `<br><span class="muted small">${esc(q.description)}</span>` : ''}</span>
        <span class="badge ${cls}">${r ? `лучший: ${r.best}%` : 'не пройден'}</span>
      </a></li>`;
    }).join('')}</ul>` : '<div class="empty">Квизов пока нет</div>'}

    <div class="grid" style="margin-top:28px">
      <a class="card" href="#/s/${esc(s.id)}/cards">
        <h3>🃏 Карточки</h3>
        <p class="muted small">Термины, формулы, определения — повторение по принципу «знаю / ещё раз».</p>
        ${st.cards.total ? progressBar((st.cards.known / st.cards.total) * 100, `${st.cards.known}/${st.cards.total}`) : '<span class="muted small">Карточек пока нет</span>'}
      </a>
      <a class="card" href="#/s/${esc(s.id)}/questions">
        <h3>🎓 Вопросы к экзамену</h3>
        <p class="muted small">Список билетов с ответами и отметками, что уже выучено.</p>
        ${st.questions.total ? progressBar((st.questions.known / st.questions.total) * 100, `${st.questions.known}/${st.questions.total}`) : '<span class="muted small">Вопросов пока нет</span>'}
      </a>
    </div>

    ${s.links.length ? `
      <div class="section-head"><h2>🔗 Полезные ссылки</h2></div>
      <ul class="list">${s.links.map((l) => `<li><a class="list-item" href="${esc(l.url)}" target="_blank" rel="noopener"><span class="grow">${esc(l.title)}</span><span class="muted">↗</span></a></li>`).join('')}</ul>
    ` : ''}

    <div class="btn-row" style="margin-top:32px">
      <button class="btn sm" id="reset">Сбросить прогресс по предмету</button>
    </div>
  `;

  app.querySelector('#reset').addEventListener('click', () => {
    if (confirm(`Сбросить весь прогресс по предмету «${s.title}»?`)) {
      store.resetSubject(s.id);
      renderSubject(app, id);
    }
  });
}
