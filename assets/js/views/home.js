import { getAllSubjects, getTimetable } from '../content.js';
import { subjectStats } from '../progress.js';
import { esc, formatDate, daysUntil, daysShort, progressBar, plural } from '../utils.js';
import { inSemester, lessonsOn, lessonState, lessonTitle, weekInfo } from '../timetable.js';

function todayCell(tt, subjects) {
  if (!tt) return '';
  const now = new Date();
  const byId = Object.fromEntries(subjects.map((s) => [s.id, s]));
  const wi = weekInfo(tt, now);
  const lessons = inSemester(tt, now) ? lessonsOn(tt, now) : [];
  const upcoming = lessons.filter((l) => lessonState(l, now) !== 'past');
  const current = upcoming.find((l) => lessonState(l, now) === 'now');
  const next = current || upcoming[0];

  let body;
  if (!inSemester(tt, now)) body = '<div class="big">Сессия</div><div class="small muted">Занятия закончились</div>';
  else if (!lessons.length) body = '<div class="big">—</div><div class="small muted">Пар сегодня нет</div>';
  else if (!next) body = `<div class="big">${lessons.length}<span class="unit">${plural(lessons.length, 'пара', 'пары', 'пар')}</span></div><div class="small muted">На сегодня всё</div>`;
  else body = `
    <div class="big">${esc(next.start)}</div>
    <div>${current ? '<span class="hl">идёт сейчас</span> · ' : ''}<strong>${esc(lessonTitle(next, byId))}</strong></div>
    <div class="small muted">${[next.type, next.room && `ауд. ${next.room}`].filter(Boolean).map(esc).join(' · ')}${upcoming.length > 1 ? ` · ещё ${upcoming.length - 1} после` : ''}</div>`;

  return `<a class="summary-cell wide" href="#/timetable">
    <span class="label">Сегодня${wi.type ? ` · ${esc(wi.type)}` : ''}</span>
    ${body}
  </a>`;
}

export async function renderHome(app) {
  const [{ portal, subjects, errors }, tt] = await Promise.all([getAllSubjects(), getTimetable().catch(() => null)]);
  const stats = await Promise.all(subjects.map(subjectStats));

  const upcoming = subjects
    .map((s) => ({ s, days: daysUntil(s.exam?.date) }))
    .filter((x) => x.days != null && x.days >= 0)
    .sort((a, b) => a.days - b.days);
  const next = upcoming[0];
  const overall = stats.length ? Math.round(stats.reduce((a, st) => a + st.readiness, 0) / stats.length) : 0;

  // Таблица предметов: по дате экзамена, без даты — в конце
  const rows = subjects.map((s, i) => ({ s, st: stats[i], days: daysUntil(s.exam?.date) }))
    .sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9));

  app.innerHTML = `
    <div class="page-head">
      <span class="label">${esc(portal.term || 'Зимняя сессия')}</span>
      <h1>${esc(portal.title || 'Подготовка к сессии')}</h1>
      ${portal.description ? `<p class="lead">${esc(portal.description)}</p>` : ''}
    </div>

    <div class="summary">
      ${todayCell(tt, subjects)}
      ${next ? `<a class="summary-cell" href="#/s/${esc(next.s.id)}">
          <span class="label">До экзамена</span>
          <div class="big">${next.days === 0 ? 'Сегодня' : next.days === 1 ? 'Завтра' : `${next.days}<span class="unit">${plural(next.days, 'день', 'дня', 'дней')}</span>`}</div>
          <div><strong>${esc(next.s.title)}</strong></div>
          <div class="small muted">${esc(formatDate(next.s.exam.date))}</div>
        </a>` : `<div><span class="label">До экзамена</span><div class="big">—</div><div class="small muted">Даты пока не указаны</div></div>`}
      <div>
        <span class="label">Готовность</span>
        <div class="big">${overall}<span class="unit">%</span></div>
        <div class="small muted">в среднем по ${subjects.length} ${plural(subjects.length, 'предмету', 'предметам', 'предметам')}</div>
      </div>
    </div>

    ${errors.length ? `<div class="error-box" style="margin-top:var(--s5)"><strong>Ошибки в контенте</strong><ul>${errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}

    <section class="section">
      <div class="section-head"><h2>Предметы</h2><span class="aside"><a href="#/schedule">Расписание сессии</a></span></div>
      ${subjects.length ? `<div class="table-wrap"><table class="table stack">
        <thead><tr>
          <th>Предмет</th><th class="hide-sm">Контроль</th><th>Дата</th><th class="hide-sm">Осталось</th><th style="width:28%">Готовность</th>
        </tr></thead>
        <tbody>${rows.map(({ s, st, days }) => `
          <tr class="${days != null && days < 0 ? 'past' : ''}">
            <td class="cell-main"><div class="subject-name" style="--subject:${esc(s.color || '')}"><span class="swatch"></span><span>
              <a href="#/s/${esc(s.id)}">${esc(s.title)}</a>
              <div class="small muted" style="font-weight:400">${contentSummary(st)}</div>
            </span></div></td>
            <td class="hide-sm">${esc(s.exam?.type || 'Экзамен')}</td>
            <td class="small"><span class="mono">${esc(formatDate(s.exam?.date, false))}</span><span class="sm-only muted"> · ${esc(s.exam?.type || 'Экзамен').toLowerCase()} · ${daysShort(days)}</span></td>
            <td class="hide-sm small">${daysShort(days)}</td>
            <td>${progressBar(st.readiness)}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>` : '<div class="empty">Предметов пока нет. Добавьте папку в <code>content/</code> и укажите её в <code>content/subjects.json</code>.</div>'}
    </section>
  `;
}

function contentSummary(st) {
  const bits = [
    st.topics.total && `${st.topics.done}/${st.topics.total} тем`,
    st.quizzes.total && `${st.quizzes.total} ${plural(st.quizzes.total, 'квиз', 'квиза', 'квизов')}`,
    st.questions.total && `${st.questions.total} ${plural(st.questions.total, 'вопрос', 'вопроса', 'вопросов')}`,
  ].filter(Boolean);
  return bits.join(' · ') || 'материалов пока нет';
}
