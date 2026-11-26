import { getAllSubjects, getTimetable } from '../content.js';
import { esc } from '../utils.js';
import { DAY_NAMES, dayIndex, mondayOf, weekInfo, inSemester, lessonsOn, lessonState, lessonTitle, typeClass } from '../timetable.js';

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

export function lessonHTML(l, subjectsById, state) {
  const title = lessonTitle(l, subjectsById);
  const subjLink = subjectsById[l.subject] ? `#/s/${esc(l.subject)}` : null;
  return `<li class="lesson ${state === 'now' ? 'now' : ''} ${state === 'past' ? 'past' : ''}" style="--subject:${esc(subjectsById[l.subject]?.color || 'var(--border)')}">
    <div class="lesson-time">${esc(l.start)}<br><span class="muted">${esc(l.end)}</span></div>
    <div class="grow">
      <div><strong>${subjLink ? `<a href="${subjLink}">${esc(title)}</a>` : esc(title)}</strong></div>
      <div class="small muted lesson-meta">
        ${l.type ? `<span class="badge ${typeClass(l.type)}">${esc(l.type)}</span>` : ''}
        ${l.week ? `<span class="badge">${esc(l.week)}</span>` : ''}
        ${state === 'now' ? '<span class="badge ok">идёт сейчас</span>' : ''}
        ${l.room ? `<span>📍 ${esc(l.room)}</span>` : ''}
        ${l.teacher ? `<span>👤 ${esc(l.teacher)}</span>` : ''}
        ${l.link ? `<a href="${esc(l.link)}" target="_blank" rel="noopener">онлайн ↗</a>` : ''}
      </div>
    </div>
  </li>`;
}

export async function renderTimetable(app) {
  const [tt, { subjects }] = await Promise.all([getTimetable(), getAllSubjects()]);
  const subjectsById = Object.fromEntries(subjects.map((s) => [s.id, s]));

  if (!tt) {
    app.innerHTML = `<h1>🗓 Расписание занятий</h1>
      <div class="empty">Расписание ещё не добавлено. Создайте файл <code>content/timetable.json</code> — формат описан в README.</div>`;
    return;
  }

  let offset = 0; // 0 — эта неделя, 1 — следующая
  const hasSunday = (tt.lessons || []).some((l) => dayIndex(l.day) === 7);

  function draw() {
    const today = new Date();
    const monday = mondayOf(today);
    monday.setDate(monday.getDate() + offset * 7);
    const wi = weekInfo(tt, monday);
    const days = hasSunday ? 7 : 6;

    const dayCards = Array.from({ length: days }, (_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const isToday = date.toDateString() === today.toDateString();
      const lessons = inSemester(tt, date) ? lessonsOn(tt, date) : [];
      return `<section class="card day-card ${isToday ? 'today' : ''}">
        <div class="day-head"><strong>${DAY_NAMES[i + 1]}</strong><span class="muted small">${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}${isToday ? ' · сегодня' : ''}</span></div>
        ${lessons.length
          ? `<ul class="list lessons">${lessons.map((l) => lessonHTML(l, subjectsById, isToday ? lessonState(l, today) : null)).join('')}</ul>`
          : '<p class="muted small" style="margin:0">Занятий нет</p>'}
      </section>`;
    }).join('');

    app.innerHTML = `
      <h1>🗓 Расписание занятий</h1>
      <p class="muted">${tt.group ? `${esc(tt.group)} · ` : ''}${wi.number ? `${wi.number}-я неделя · <strong>${esc(wi.type)}</strong>` : ''}</p>
      ${!inSemester(tt, today) ? '<div class="card" style="margin-bottom:16px">Семестр завершён — сейчас сессия. <a href="#/schedule">Смотреть расписание экзаменов →</a></div>' : ''}
      <div class="toolbar">
        <div class="seg">
          <button data-week="0" class="${offset === 0 ? 'active' : ''}">Эта неделя</button>
          <button data-week="1" class="${offset === 1 ? 'active' : ''}">Следующая</button>
        </div>
      </div>
      <div class="week-grid">${dayCards}</div>
    `;
    app.querySelectorAll('[data-week]').forEach((b) => b.addEventListener('click', () => { offset = Number(b.dataset.week); draw(); }));
  }

  draw();
  const timer = setInterval(draw, 60000); // обновлять «идёт сейчас»
  return () => clearInterval(timer);
}
