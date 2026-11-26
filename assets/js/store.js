// Прогресс пользователя в localStorage. Всё обёрнуто в try/catch:
// в приватном режиме хранилище может быть недоступно — тогда прогресс живёт до перезагрузки.

const KEY = 'prep-portal:v1';
let state = load();

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch { /* хранилище недоступно */ }
}

function bucket(kind, subjectId) {
  state[kind] ??= {};
  state[kind][subjectId] ??= {};
  return state[kind][subjectId];
}

export const store = {
  // Темы
  isTopicDone: (s, t) => !!bucket('topics', s)[t],
  setTopicDone(s, t, done) {
    const b = bucket('topics', s);
    if (done) b[t] = true; else delete b[t];
    save();
  },

  // Квизы: { best, last, attempts }
  quizResult: (s, q) => bucket('quizzes', s)[q] || null,
  saveQuizResult(s, q, percent) {
    const b = bucket('quizzes', s);
    const prev = b[q] || { best: 0, attempts: 0 };
    b[q] = { best: Math.max(prev.best, percent), last: percent, attempts: prev.attempts + 1 };
    save();
  },

  // Карточки: 'known' | 'again'
  cardStatus: (s, id) => bucket('cards', s)[id] || null,
  setCardStatus(s, id, status) {
    bucket('cards', s)[id] = status;
    save();
  },

  // Вопросы к экзамену: 'known' | 'review' | 'unknown'
  questionStatus: (s, id) => bucket('questions', s)[id] || null,
  setQuestionStatus(s, id, status) {
    const b = bucket('questions', s);
    if (status) b[id] = status; else delete b[id];
    save();
  },

  resetSubject(s) {
    for (const kind of ['topics', 'quizzes', 'cards', 'questions']) {
      if (state[kind]) delete state[kind][s];
    }
    save();
  },
};

// Тема оформления — тоже персональная настройка
export function getTheme() {
  try { return localStorage.getItem('prep-portal:theme'); } catch { return null; }
}
export function setTheme(t) {
  try { localStorage.setItem('prep-portal:theme', t); } catch { /* ignore */ }
}
