// Загрузка контента из папки content/. Всё описано в JSON/Markdown — код трогать не нужно.

const cache = new Map();

function fetchText(path) {
  if (cache.has(path)) return cache.get(path);
  const p = fetch(path, { cache: 'no-cache' }).then((r) => {
    if (!r.ok) throw new Error(`Не удалось загрузить ${path} (${r.status})`);
    return r.text();
  });
  cache.set(path, p);
  p.catch(() => cache.delete(path));
  return p;
}

async function fetchJSON(path) {
  const text = await fetchText(path);
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Ошибка в JSON-файле ${path}: ${e.message}`);
  }
}

export function getPortal() {
  return fetchJSON('content/subjects.json');
}

export async function getSubject(id) {
  const s = await fetchJSON(`content/${id}/subject.json`);
  return { topics: [], quizzes: [], links: [], ...s, id, base: `content/${id}/` };
}

export async function getAllSubjects() {
  const portal = await getPortal();
  const results = await Promise.allSettled(portal.subjects.map(getSubject));
  return {
    portal,
    subjects: results.filter((r) => r.status === 'fulfilled').map((r) => r.value),
    errors: results.filter((r) => r.status === 'rejected').map((r) => r.reason.message),
  };
}

/** Расписание занятий (content/timetable.json). Если файла нет — null. */
export async function getTimetable() {
  const r = await fetch('content/timetable.json', { cache: 'no-cache' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Не удалось загрузить content/timetable.json (${r.status})`);
  try {
    return await r.json();
  } catch (e) {
    throw new Error(`Ошибка в JSON-файле content/timetable.json: ${e.message}`);
  }
}

export const getTopicText =(subject, topic) => fetchText(subject.base + topic.file);
/**
 * Квиз. Вопросы можно не копировать, а брать из общего банка:
 *   { "title": "...", "source": "quizzes/bank.json", "range": [1, 16], "sample": 30 }
 * range — номера вопросов банка (с 1, включительно), sample — сколько случайных вопросов брать в попытку.
 */
export async function getQuiz(subject, quiz) {
  const data = await fetchJSON(subject.base + quiz.file);
  if (!data.source) return data;
  const bank = await fetchJSON(subject.base + data.source);
  let questions = bank.questions || [];
  if (Array.isArray(data.range)) questions = questions.slice(data.range[0] - 1, data.range[1]);
  return { ...data, questions };
}

export async function getFlashcards(subject) {
  if (!subject.flashcards) return [];
  const data = await fetchJSON(subject.base + subject.flashcards);
  return (Array.isArray(data) ? data : data.cards || []).map((c, i) => ({ id: String(c.id ?? i), ...c }));
}

export async function getQuestions(subject) {
  if (!subject.questions) return [];
  const data = await fetchJSON(subject.base + subject.questions);
  return (Array.isArray(data) ? data : data.questions || []).map((q, i) => ({ id: String(q.id ?? i + 1), ...q }));
}
