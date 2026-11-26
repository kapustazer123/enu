// Прогресс пользователя.
// Без входа — только localStorage этого браузера. После входа каждое изменение — операция,
// которая применяется локально и пачкой отправляется на сервер (worker/index.js, те же правила).

import { api } from './api.js';

const GUEST_KEY = 'prep-portal:v1';
const userKey = (id) => `prep-portal:user:${id}`;

let user = null;           // { id, username, ... } после входа
let state = load(GUEST_KEY);
let queue = [];            // операции, ещё не отправленные на сервер
let flushTimer = null;
let syncStatus = 'local';  // 'local' | 'synced' | 'pending' | 'offline'
const listeners = new Set();

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; }
}
function save() {
  try { localStorage.setItem(user ? userKey(user.id) : GUEST_KEY, JSON.stringify(state)); } catch { /* недоступно */ }
}
function setStatus(s) { syncStatus = s; listeners.forEach((fn) => fn(s)); }

function bucket(kind, s) {
  state[kind] ??= {};
  state[kind][s] ??= {};
  return state[kind][s];
}

/** Применение операции к локальному состоянию (зеркало applyOp на сервере). */
function apply(op) {
  const { k, s, id, v } = op;
  switch (k) {
    case 'topic': { const b = bucket('topics', s); if (v) b[id] = true; else delete b[id]; break; }
    case 'quiz': {
      const b = bucket('quizzes', s); const prev = b[id] || { best: 0, attempts: 0 };
      b[id] = { best: Math.max(prev.best, v), last: v, attempts: prev.attempts + 1 };
      break;
    }
    case 'card': { const b = bucket('cards', s); if (v) b[id] = v; else delete b[id]; break; }
    case 'question': { const b = bucket('questions', s); if (v) b[id] = v; else delete b[id]; break; }
    case 'note': { const b = bucket('notes', s); if (String(v ?? '').trim()) b[id] = v; else delete b[id]; break; }
    case 'answer': {
      const b = bucket('mistakes', s); const prev = b[id] || { w: 0, r: 0, t: 0 };
      b[id] = v ? { w: prev.w, r: prev.r + 1, t: prev.t + 1 } : { w: prev.w + 1, r: 0, t: prev.t + 1 };
      break;
    }
    case 'reset':
      for (const kind of ['topics', 'quizzes', 'cards', 'questions', 'mistakes']) if (state[kind]) delete state[kind][s];
      break;
  }
}

function commit(op, { coalesce = false } = {}) {
  apply(op);
  save();
  if (!user) return;
  // Для заметок отправляем только последнее значение
  if (coalesce) queue = queue.filter((q) => !(q.k === op.k && q.s === op.s && q.id === op.id));
  queue.push(op);
  setStatus('pending');
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 1200);
}

let summaryProvider = null;
/** progress.js регистрирует функцию, которая считает готовность по предметам для рейтинга. */
export function setSummaryProvider(fn) { summaryProvider = fn; }

async function flush() {
  if (!user || !queue.length) return;
  const ops = queue.splice(0, 500);
  try {
    const summary = summaryProvider ? await summaryProvider().catch(() => undefined) : undefined;
    await api.post('/api/progress', { ops, summary });
    setStatus(queue.length ? 'pending' : 'synced');
    if (queue.length) flush();
  } catch (e) {
    queue = ops.concat(queue); // вернём в очередь, отправим позже
    setStatus(e.status === 401 ? 'local' : 'offline');
    if (e.status !== 401) flushTimer = setTimeout(flush, 15000);
  }
}

window.addEventListener('online', () => { if (queue.length) flush(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

/** Вызывается после входа: переносим гостевой прогресс в аккаунт и берём серверное состояние. */
export async function attachUser(u, { importGuest = false } = {}) {
  user = u;
  state = load(userKey(u.id)); // кэш с прошлого раза — показываем сразу
  try {
    const guest = load(GUEST_KEY);
    const hasGuest = Object.keys(guest).some((k) => Object.keys(guest[k] || {}).length);
    let res;
    if (importGuest && hasGuest) {
      res = await api.post('/api/progress', { ops: [{ k: 'import', v: guest }] });
      try { localStorage.removeItem(GUEST_KEY); } catch { /* ignore */ }
    } else {
      res = await api.get('/api/progress');
    }
    state = res.data || {};
    queue.forEach(apply); // несохранённые изменения поверх серверных
    save();
    setStatus(queue.length ? 'pending' : 'synced');
    if (queue.length) flush();
    else pushSummary();
  } catch {
    setStatus('offline');
  }
}

export function detachUser() {
  user = null;
  queue = [];
  clearTimeout(flushTimer);
  state = load(GUEST_KEY);
  setStatus('local');
}

/** Отправить актуальную сводку для рейтинга (без изменений прогресса). */
export async function pushSummary() {
  if (!user || !summaryProvider) return;
  try { await api.post('/api/progress', { ops: [], summary: await summaryProvider() }); } catch { /* не критично */ }
}

export const sync = {
  get status() { return syncStatus; },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  flush,
};

export const store = {
  isTopicDone: (s, t) => !!bucket('topics', s)[t],
  setTopicDone: (s, t, done) => commit({ k: 'topic', s, id: t, v: !!done }),

  quizResult: (s, q) => bucket('quizzes', s)[q] || null,
  saveQuizResult: (s, q, percent) => commit({ k: 'quiz', s, id: q, v: percent }),

  cardStatus: (s, id) => bucket('cards', s)[id] || null,
  setCardStatus: (s, id, status) => commit({ k: 'card', s, id, v: status }),

  questionStatus: (s, id) => bucket('questions', s)[id] || null,
  setQuestionStatus: (s, id, status) => commit({ k: 'question', s, id, v: status || null }),

  note: (s, id) => bucket('notes', s)[id] || '',
  setNote: (s, id, text) => commit({ k: 'note', s, id, v: text }, { coalesce: true }),

  /** Статистика ответов на вопрос квиза: { w — ошибок, r — верно подряд, t — всего } */
  answerStats: (s, key) => bucket('mistakes', s)[key] || null,
  allAnswerStats: (s) => bucket('mistakes', s),
  recordAnswer: (s, key, ok) => commit({ k: 'answer', s, id: key, v: !!ok }),

  resetSubject: (s) => commit({ k: 'reset', s }),
};

// Тема оформления — персональная настройка этого браузера
export function getTheme() {
  try { return localStorage.getItem('prep-portal:theme'); } catch { return null; }
}
export function setTheme(t) {
  try { localStorage.setItem('prep-portal:theme', t); } catch { /* ignore */ }
}
