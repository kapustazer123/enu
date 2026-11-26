import { getAllSubjects } from '../content.js';
import { esc, formatDate, daysUntil, daysBadge, parseDate } from '../utils.js';

export async function renderSchedule(app) {
  const { subjects } = await getAllSubjects();

  // У предмета может быть несколько событий: консультация, экзамен, пересдача.
  const events = subjects.flatMap((s) => {
    const list = [];
    if (s.exam) list.push({ s, ...s.exam, type: s.exam.type || 'Экзамен' });
    for (const e of s.events || []) list.push({ s, ...e });
    return list;
  }).sort((a, b) => (parseDate(a.date)?.getTime() ?? Infinity) - (parseDate(b.date)?.getTime() ?? Infinity));

  app.innerHTML = `
    <h1>📅 Расписание сессии</h1>
    ${events.length ? `<div class="table-wrap"><table class="schedule">
      <thead><tr><th>Дата</th><th>Предмет</th><th>Что</th><th>Где</th><th></th></tr></thead>
      <tbody>${events.map((e) => {
        const days = daysUntil(e.date);
        return `<tr style="${days != null && days < 0 ? 'opacity:.5' : ''}">
          <td>${esc(formatDate(e.date))}</td>
          <td><a href="#/s/${esc(e.s.id)}">${esc(e.s.title)}</a></td>
          <td>${esc(e.type)}</td>
          <td>${esc(e.place || '—')}</td>
          <td>${daysBadge(days)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>` : '<div class="empty">Даты пока не добавлены. Укажите <code>exam.date</code> в <code>subject.json</code> предмета.</div>'}
  `;
}
