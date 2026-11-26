// Ссылки на онлайн-занятия.
// Публичные — поле link у пар в content/timetable.json (видны всем).
// Закрытые (необязательно) — в базе на сервере, по коду группы; добавляются к публичным.

import { api } from './api.js';
import { auth } from './auth.js';
import { getTimetable } from './content.js';
import { dayIndex } from './timetable.js';

let cache = null;
auth.onChange(() => { cache = null; });

async function publicLinks() {
  const tt = await getTimetable().catch(() => null);
  return (tt?.lessons || []).filter((l) => l.link).map((l) => ({
    subject: l.subject, type: l.type, day: l.day, start: l.start, end: l.end, platform: l.platform || '', url: l.link,
  }));
}

async function privateLinks() {
  if (!auth.user) return { links: [], access: auth.available ? 'guest' : 'unavailable' };
  return api.get('/api/links')
    .then((r) => ({ links: r.links || [], access: 'granted' }))
    .catch((e) => ({ links: [], access: e.status === 403 ? 'need-code' : 'unavailable' }));
}

/** { links: [...], access: 'public' | 'granted' | 'need-code' | 'guest' | 'unavailable' } */
export function getLessonLinks() {
  cache ??= Promise.all([publicLinks(), privateLinks()]).then(([pub, priv]) => {
    const links = [...pub];
    for (const l of priv.links) if (!linkForLesson(links, l)) links.push(l);
    return { links, access: pub.length ? 'public' : priv.access };
  });
  return cache;
}

export function resetLinksCache() { cache = null; }

/** Ссылка для конкретной пары расписания: тот же предмет, день и время начала. */
export function linkForLesson(links, lesson) {
  return links.find((l) => l.subject === lesson.subject && dayIndex(l.day) === dayIndex(lesson.day) && l.start === lesson.start) || null;
}
