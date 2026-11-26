import { getAllSubjects } from '../content.js';
import { esc, formatDate, daysUntil, daysShort, parseDate } from '../utils.js';

export async function renderSchedule(app) {
  const { subjects } = await getAllSubjects();

  // У предмета может быть несколько событий: консультация, экзамен, пересдача.
  const events = subjects.flatMap((s) => {
    const list = [];
    if (s.exam) list.push({ s, ...s.exam, type: s.exam.type || 'Экзамен', main: true });
    for (const e of s.events || []) list.push({ s, ...e });
    return list;
  }).sort((a, b) => (parseDate(a.date)?.getTime() ?? Infinity) - (parseDate(b.date)?.getTime() ?? Infinity));

  app.innerHTML = `
    <div class="page-head">
      <span class="label">Сессия</span>
      <h1>Расписание экзаменов</h1>
      <p class="lead">Экзамены, зачёты и консультации по всем предметам.</p>
    </div>
    ${events.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Дата</th><th>Предмет</th><th>Что</th><th class="hide-sm">Где</th><th class="num">Осталось</th></tr></thead>
      <tbody>${events.map((e) => {
        const days = daysUntil(e.date);
        return `<tr class="${days != null && days < 0 ? 'past' : ''}">
          <td class="mono small" style="white-space:nowrap">${esc(formatDate(e.date))}</td>
          <td><div class="subject-name" style="--subject:${esc(e.s.color || '')}"><span class="swatch"></span><a href="#/s/${esc(e.s.id)}">${esc(e.s.title)}</a></div></td>
          <td>${e.main ? `<strong>${esc(e.type)}</strong>` : esc(e.type)}</td>
          <td class="hide-sm">${esc(e.place || '—')}</td>
          <td class="num small" style="white-space:nowrap">${daysShort(days)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>` : '<div class="empty">Даты пока не добавлены. Укажите <code>exam.date</code> в <code>subject.json</code> предмета.</div>'}
  `;
}
