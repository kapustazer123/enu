// Логика расписания занятий: номер недели, числитель/знаменатель, пары на день.

const DAY_ALIASES = { пн: 1, вт: 2, ср: 3, чт: 4, пт: 5, сб: 6, вс: 7 };
export const DAY_NAMES = ['', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];

const DAY_MS = 86400000;

export function dayIndex(d) {
  if (typeof d === 'number') return d;
  return DAY_ALIASES[String(d).trim().toLowerCase().slice(0, 2)] ?? Number(d);
}

/** Понедельник недели, в которую попадает дата (полночь по местному времени). */
export function mondayOf(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** Номер учебной недели (с 1) и её тип. */
export function weekInfo(tt, date = new Date()) {
  const start = tt.semesterStart ? mondayOf(new Date(tt.semesterStart)) : null;
  if (!start || isNaN(start)) return { number: null, type: null };
  const number = Math.floor(Math.round((mondayOf(date) - start) / DAY_MS) / 7) + 1;
  const first = (tt.firstWeek || 'числитель').toLowerCase();
  const other = first === 'числитель' ? 'знаменатель' : 'числитель';
  return { number, type: number % 2 === 1 ? first : other };
}

export function inSemester(tt, date = new Date()) {
  const d = new Date(date); d.setHours(0, 0, 0, 0);
  if (tt.semesterStart && d < new Date(tt.semesterStart + 'T00:00')) return false;
  if (tt.semesterEnd && d > new Date(tt.semesterEnd + 'T23:59')) return false;
  return true;
}

/** Пары на конкретную дату с учётом числителя/знаменателя. */
export function lessonsOn(tt, date) {
  const dow = ((date.getDay() + 6) % 7) + 1;
  const { type } = weekInfo(tt, date);
  return (tt.lessons || [])
    .filter((l) => dayIndex(l.day) === dow)
    .filter((l) => !l.week || !type || l.week.toLowerCase() === type)
    .sort((a, b) => a.start.localeCompare(b.start));
}

export function minutesOf(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + (m || 0);
}

/** 'now' | 'past' | 'future' для пары сегодня. */
export function lessonState(lesson, now = new Date()) {
  const cur = now.getHours() * 60 + now.getMinutes();
  if (cur < minutesOf(lesson.start)) return 'future';
  if (cur >= minutesOf(lesson.end)) return 'past';
  return 'now';
}

export function lessonTitle(lesson, subjectsById) {
  return lesson.title || subjectsById[lesson.subject]?.title || lesson.subject || 'Занятие';
}

export function typeClass(type = '') {
  const t = type.toLowerCase();
  if (t.startsWith('лек')) return 'accent';
  if (t.startsWith('лаб')) return 'warn';
  if (t.startsWith('прак') || t.startsWith('сем')) return 'ok';
  return '';
}
