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

export const getTopicText = (subject, topic) => fetchText(subject.base + topic.file);
export const getQuiz = (subject, quiz) => fetchJSON(subject.base + quiz.file);

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
