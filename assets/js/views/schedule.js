import { getAllSubjects } from '../content.js';
import { esc, formatDate, daysUntil, daysShort, parseDate } from '../utils.js';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function range(start, end) {
  const a = parseDate(start), b = parseDate(end || start);
  if (!a) return '—';
  if (!b || +a === +b) return `${a.getDate()} ${MONTHS[a.getMonth()]}`;
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}`;
  return `${a.getDate()} ${MONTHS[a.getMonth()]} – ${b.getDate()} ${MONTHS[b.getMonth()]}${a.getFullYear() !== b.getFullYear() ? ` ${b.getFullYear()}` : ''}`;
}

function rangeStatus(start, end) {
  const s = daysUntil(start), e = daysUntil(end || start);
  if (e != null && e < 0) return 'прошло';
  if (s != null && s <= 0) return '<span class="hl">идёт сейчас</span>';
  return daysShort(s);
}

function calendarHTML(calendar) {
  if (!calendar?.length) return '';
  return `
    <section class="section">
      <div class="section-head"><h2>Академический календарь</h2></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Период</th><th>Даты</th><th class="num">Статус</th></tr></thead>
        <tbody>${calendar.map((c) => {
          const past = (daysUntil(c.end || c.start) ?? 0) < 0;
          return `<tr class="${past ? 'past' : ''}">
            <td>${c.important ? `<strong>${esc(c.title)}</strong>` : esc(c.title)}</td>
            <td class="mono small" style="white-space:nowrap">${esc(range(c.start, c.end))}</td>
            <td class="num small" style="white-space:nowrap">${rangeStatus(c.start, c.end)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>
    </section>`;
}

export async function renderSchedule(app) {
  const { subjects, portal } = await getAllSubjects();

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
    ${calendarHTML(portal.calendar)}
  `;
}
