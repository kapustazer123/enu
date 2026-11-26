import { getAllSubjects } from '../content.js';
import { subjectStats } from '../progress.js';
import { esc, formatDate, daysUntil, daysBadge, daysLabel, progressBar, plural } from '../utils.js';

export async function renderHome(app) {
  const { portal, subjects, errors } = await getAllSubjects();
  const stats = await Promise.all(subjects.map(subjectStats));

  const upcoming = subjects
    .map((s) => ({ s, days: daysUntil(s.exam?.date) }))
    .filter((x) => x.days != null && x.days >= 0)
    .sort((a, b) => a.days - b.days);
  const next = upcoming[0];
  const overall = stats.length ? Math.round(stats.reduce((a, st) => a + st.readiness, 0) / stats.length) : 0;

  app.innerHTML = `
    <h1>${esc(portal.title || 'Подготовка к сессии')}</h1>
    ${portal.description ? `<p class="muted">${esc(portal.description)}</p>` : ''}

    <div class="hero">
      <div class="card">
        <div class="muted small">Ближайший экзамен</div>
        ${next ? `
          <div class="countdown">${next.days === 0 ? 'Сегодня' : next.days === 1 ? 'Завтра' : `${next.days} ${plural(next.days, 'день', 'дня', 'дней')}`}</div>
          <div><a href="#/s/${esc(next.s.id)}">${esc(next.s.title)}</a> · <span class="muted">${esc(formatDate(next.s.exam.date))}</span></div>
        ` : '<div class="countdown">—</div><div class="muted">Даты экзаменов пока не указаны</div>'}
      </div>
      <div class="card">
        <div class="muted small">Общая готовность</div>
        <div class="countdown">${overall}%</div>
        ${progressBar(overall, `${subjects.length} ${plural(subjects.length, 'предмет', 'предмета', 'предметов')}`)}
      </div>
    </div>

    ${errors.length ? `<div class="card" style="border-color:var(--bad)"><strong>Ошибки в контенте:</strong><ul>${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}

    <div class="section-head"><h2>Предметы</h2><a href="#/schedule" class="small">Расписание сессии →</a></div>
    ${subjects.length ? `<div class="grid">
      ${subjects.map((s, i) => subjectCard(s, stats[i])).join('')}
    </div>` : '<div class="empty">Предметов пока нет. Добавьте папку в <code>content/</code> и укажите её в <code>content/subjects.json</code>.</div>'}
  `;
}

function subjectCard(s, st) {
  const days = daysUntil(s.exam?.date);
  const bits = [
    st.topics.total && `${st.topics.done}/${st.topics.total} тем`,
    st.quizzes.total && `${st.quizzes.total} ${plural(st.quizzes.total, 'квиз', 'квиза', 'квизов')}`,
    st.cards.total && `${st.cards.total} карточек`,
    st.questions.total && `${st.questions.total} вопросов`,
  ].filter(Boolean);
  return `
    <a class="card subject-card" href="#/s/${esc(s.id)}" style="--subject:${esc(s.color || 'var(--accent)')}" title="${esc(daysLabel(days))}">
      <h3>${esc(s.title)}</h3>
      <div class="card-meta">
        <span>${esc(s.exam?.type || 'Экзамен')}: ${esc(formatDate(s.exam?.date, false))}</span>
        ${daysBadge(days)}
      </div>
      <div class="muted small" style="margin-bottom:10px">${bits.join(' · ') || 'Контент пока не добавлен'}</div>
      ${progressBar(st.readiness, `готовность ${st.readiness}%`)}
    </a>`;
}
