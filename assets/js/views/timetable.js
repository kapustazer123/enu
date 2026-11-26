import { getAllSubjects, getTimetable } from '../content.js';
import { esc } from '../utils.js';
import { DAY_NAMES, dayIndex, mondayOf, weekInfo, inSemester, lessonsOn, lessonState, lessonTitle, placeLabel } from '../timetable.js';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

export function lessonHTML(l, subjectsById, state) {
  const title = lessonTitle(l, subjectsById);
  const subj = subjectsById[l.subject];
  return `<li class="lesson ${state === 'past' ? 'past' : ''}" style="--subject:${esc(subj?.color || '')}">
    <span class="lesson-time">${esc(l.start)}–${esc(l.end)}</span>
    <span class="swatch"></span>
    <div class="grow">
      <div class="lesson-title">${state === 'now' ? '<span class="hl">идёт сейчас</span> · ' : ''}${subj ? `<a href="#/s/${esc(l.subject)}">${esc(title)}</a>` : esc(title)}</div>
      <div class="lesson-meta">
        ${l.type ? `<span>${esc(l.type)}</span>` : ''}
        ${placeLabel(l) ? `<span>${esc(placeLabel(l))}</span>` : ''}
        ${l.teacher ? `<span>${esc(l.teacher)}</span>` : ''}
        ${l.week ? `<span class="tag">${esc(l.week)}</span>` : ''}
        ${l.link ? `<a href="${esc(l.link)}" target="_blank" rel="noopener">${l.online ? 'подключиться' : 'ссылка'} ↗</a>` : ''}
      </div>
    </div>
  </li>`;
}

export async function renderTimetable(app) {
  const [tt, { subjects }] = await Promise.all([getTimetable(), getAllSubjects()]);
  const subjectsById = Object.fromEntries(subjects.map((s) => [s.id, s]));

  if (!tt) {
    app.innerHTML = `<div class="page-head"><span class="label">Занятия</span><h1>Расписание занятий</h1></div>
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

    const dayRows = Array.from({ length: days }, (_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      const isToday = date.toDateString() === today.toDateString();
      const lessons = inSemester(tt, date) ? lessonsOn(tt, date) : [];
      return `<section class="day ${isToday ? 'today' : ''} ${lessons.length ? '' : 'off'}">
        <div>
          <div class="day-name">${isToday ? `<span class="hl">${DAY_NAMES[i + 1]}</span>` : DAY_NAMES[i + 1]}</div>
          <div class="day-date">${date.getDate()} ${MONTHS[date.getMonth()]}${isToday ? ' · сегодня' : ''}</div>
        </div>
        ${lessons.length
          ? `<ul class="lessons">${lessons.map((l) => lessonHTML(l, subjectsById, isToday ? lessonState(l, today) : null)).join('')}</ul>`
          : '<p class="small" style="margin:0">Занятий нет</p>'}
      </section>`;
    }).join('');

    app.innerHTML = `
      <div class="page-head" style="margin-bottom:var(--s5)">
        <span class="label">${tt.group ? esc(tt.group) : 'Занятия'}</span>
        <h1>Расписание занятий</h1>
        ${wi.number ? `<p class="lead" style="margin:0">${wi.number}-я неделя${wi.type ? ` — <strong style="color:var(--ink)">${esc(wi.type)}</strong>` : ''}${tt.weeks ? ` из ${tt.weeks}` : ''}</p>` : ''}
      </div>
      ${!inSemester(tt, today) ? '<div class="notice">Семестр завершён, идёт сессия. <a href="#/schedule">Расписание экзаменов</a></div>' : ''}
      <div class="tabs" role="tablist">
        <button type="button" data-week="0" class="${offset === 0 ? 'active' : ''}">Эта неделя</button>
        <button type="button" data-week="1" class="${offset === 1 ? 'active' : ''}">Следующая</button>
      </div>
      <div class="week">${dayRows}</div>
    `;
    app.querySelectorAll('[data-week]').forEach((b) => b.addEventListener('click', () => { offset = Number(b.dataset.week); draw(); }));
  }

  draw();
  const timer = setInterval(draw, 60000); // обновлять «идёт сейчас»
  return () => clearInterval(timer);
}
