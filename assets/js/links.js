// Закрытые ссылки на онлайн-занятия: хранятся в базе на сервере, отдаются только
// вошедшим пользователям с кодом группы. В репозиторий и статические файлы не попадают.

import { api } from './api.js';
import { auth } from './auth.js';
import { dayIndex } from './timetable.js';

let cache = null;
auth.onChange(() => { cache = null; });

/** { links: [...], access: 'granted' | 'need-code' | 'guest' | 'unavailable' } */
export function getLessonLinks() {
  if (!auth.user) return Promise.resolve({ links: [], access: auth.available ? 'guest' : 'unavailable' });
  cache ??= api.get('/api/links')
    .then((r) => ({ links: r.links || [], access: 'granted' }))
    .catch((e) => ({ links: [], access: e.status === 403 ? 'need-code' : 'unavailable' }));
  return cache;
}

export function resetLinksCache() { cache = null; }

/** Ссылка для конкретной пары расписания: тот же предмет, день и время начала. */
export function linkForLesson(links, lesson) {
  return links.find((l) => l.subject === lesson.subject && dayIndex(l.day) === dayIndex(lesson.day) && l.start === lesson.start) || null;
}
