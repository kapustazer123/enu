// Cloudflare Worker: API портала (/api/*). Статику отдаёт Workers Assets (wrangler.jsonc).
// База — D1 (binding DB). Схема создаётся автоматически при первом запросе.

import { SCHEMA } from './schema.js';

const SESSION_DAYS = 60;
const PBKDF2_ITERATIONS = 100000; // максимум, который разрешает Workers runtime
const MAX_FAILED = 10;
const LOCK_MINUTES = 15;
const MAX_OPS = 500;
const MAX_NOTE = 5000;
const MAX_DATA_BYTES = 1_500_000;

let schemaReady = null;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (!env.DB) return json({ error: 'База данных не подключена' }, 503);
      schemaReady ??= env.DB.batch(SCHEMA.map((sql) => env.DB.prepare(sql))).catch((e) => { schemaReady = null; throw e; });
      await schemaReady;
      return await route(request, env, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Ошибка сервера' }, 500);
    }
  },
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

async function body(request) {
  try { return await request.json(); } catch { throw new HttpError(400, 'Некорректный запрос'); }
}

// ---------- маршруты ----------
async function route(request, env, url) {
  const { method } = request;
  const path = url.pathname.replace(/\/+$/, '');

  // Защита от CSRF: изменяющие запросы только с нашим заголовком (кросс-доменно его не отправить без CORS)
  if (method !== 'GET' && request.headers.get('x-requested-with') !== 'prep-portal') {
    throw new HttpError(403, 'Запрос отклонён');
  }

  if (path === '/api/register' && method === 'POST') return register(request, env);
  if (path === '/api/login' && method === 'POST') return login(request, env);
  if (path === '/api/logout' && method === 'POST') return logout(request, env);
  const user = await currentUser(request, env);
  if (path === '/api/leaderboard' && method === 'GET') return leaderboard(env, url, user);
  if (path === '/api/me' && method === 'GET') return json({ user: user ? publicUser(user) : null });
  if (!user) throw new HttpError(401, 'Нужно войти');

  if (path === '/api/me' && method === 'PATCH') return updateMe(request, env, user);
  if (path === '/api/password' && method === 'POST') return changePassword(request, env, user);
  if (path === '/api/progress' && method === 'GET') return getProgress(env, user);
  if (path === '/api/progress' && method === 'POST') return postProgress(request, env, user);

  if (path === '/api/links' && method === 'GET') return getLinks(env, user);
  if (path === '/api/links/unlock' && method === 'POST') return unlockLinks(request, env, user);

  if (path.startsWith('/api/admin/')) {
    if (!user.is_admin) throw new HttpError(403, 'Нужны права администратора');
    if (path === '/api/admin/file' && method === 'GET') return adminReadFile(env, url);
    if (path === '/api/admin/file' && method === 'PUT') return adminWriteFile(request, env, user);
    if (path === '/api/admin/reset-password' && method === 'POST') return adminResetPassword(request, env);
    if (path === '/api/admin/stats' && method === 'GET') return adminStats(env);
    if (path === '/api/admin/links' && method === 'GET') return adminGetLinks(env);
    if (path === '/api/admin/links' && method === 'PUT') return adminPutLinks(request, env);
  }

  throw new HttpError(404, 'Не найдено');
}

// ---------- пароли и сессии ----------
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function hashPassword(password, saltB64) {
  const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return { hash: b64(bits), salt: b64(salt) };
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256(text) {
  return b64(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

function cookie(request, name) {
  const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function sessionCookie(token, maxAge) {
  return `sid=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

async function createSession(env, userId) {
  const token = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' }[c]));
  const now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, now, now + SESSION_DAYS * 86400000).run();
  return sessionCookie(token, SESSION_DAYS * 86400);
}

const adminList = (env) => String(env.ADMIN_USERNAMES || '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);

async function currentUser(request, env) {
  const token = cookie(request, 'sid');
  if (!token) return null;
  const u = await env.DB.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`)
    .bind(await sha256(token), Date.now()).first();
  // Права администратора: флаг в базе или логин в ADMIN_USERNAMES (проверяется при каждом запросе)
  if (u && adminList(env).includes(u.username.toLowerCase())) u.is_admin = 1;
  return u;
}

function publicUser(u) {
  return { id: u.id, username: u.username, displayName: u.display_name, group: u.grp, showInRating: !!u.show_in_rating, isAdmin: !!u.is_admin };
}

// ---------- валидация ----------
const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
function cleanText(s, max) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function checkPassword(p) {
  if (typeof p !== 'string' || p.length < 8) throw new HttpError(400, 'Пароль — минимум 8 символов');
  if (p.length > 200) throw new HttpError(400, 'Слишком длинный пароль');
}

// ---------- обработчики ----------
async function register(request, env) {
  const b = await body(request);
  const username = String(b.username || '').trim();
  if (!USERNAME_RE.test(username)) throw new HttpError(400, 'Логин: 3–32 символа, латиница, цифры, точка, дефис, подчёркивание');
  checkPassword(b.password);
  const displayName = cleanText(b.displayName, 60) || username;
  const group = cleanText(b.group, 30);
  const exists = await env.DB.prepare('SELECT 1 FROM users WHERE username = ? COLLATE NOCASE').bind(username).first();
  if (exists) throw new HttpError(409, 'Такой логин уже занят');
  const { hash, salt } = await hashPassword(b.password);
  const admins = adminList(env);
  const res = await env.DB.prepare(`INSERT INTO users (username, display_name, grp, pass_hash, pass_salt, is_admin, show_in_rating, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?)`)
    .bind(username, displayName, group, hash, salt, admins.includes(username.toLowerCase()) ? 1 : 0, Date.now()).run();
  const userId = res.meta.last_row_id;
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  return json({ user: publicUser(user) }, 201, { 'set-cookie': await createSession(env, userId) });
}

async function login(request, env) {
  const b = await body(request);
  const username = String(b.username || '').trim();
  const user = await env.DB.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').bind(username).first();
  const now = Date.now();
  if (user && user.locked_until > now) {
    throw new HttpError(429, `Слишком много попыток. Попробуйте через ${Math.ceil((user.locked_until - now) / 60000)} мин.`);
  }
  // Хэшируем даже для несуществующего логина, чтобы время ответа не выдавало, есть ли такой пользователь
  const { hash } = await hashPassword(String(b.password || ''), user?.pass_salt || b64(new Uint8Array(16)));
  if (!user || !timingSafeEqual(hash, user.pass_hash)) {
    if (user) {
      const failed = user.failed_logins + 1;
      await env.DB.prepare('UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?')
        .bind(failed >= MAX_FAILED ? 0 : failed, failed >= MAX_FAILED ? now + LOCK_MINUTES * 60000 : 0, user.id).run();
    }
    throw new HttpError(401, 'Неверный логин или пароль');
  }
  await env.DB.prepare('UPDATE users SET failed_logins = 0, locked_until = 0 WHERE id = ?').bind(user.id).run();
  if (adminList(env).includes(user.username.toLowerCase())) user.is_admin = 1;
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now).run();
  return json({ user: publicUser(user) }, 200, { 'set-cookie': await createSession(env, user.id) });
}

async function logout(request, env) {
  const token = cookie(request, 'sid');
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
}

async function updateMe(request, env, user) {
  const b = await body(request);
  const displayName = b.displayName !== undefined ? cleanText(b.displayName, 60) || user.username : user.display_name;
  const group = b.group !== undefined ? cleanText(b.group, 30) : user.grp;
  const show = b.showInRating !== undefined ? (b.showInRating ? 1 : 0) : user.show_in_rating;
  await env.DB.prepare('UPDATE users SET display_name = ?, grp = ?, show_in_rating = ? WHERE id = ?').bind(displayName, group, show, user.id).run();
  return json({ user: publicUser({ ...user, display_name: displayName, grp: group, show_in_rating: show }) });
}

async function changePassword(request, env, user) {
  const b = await body(request);
  const { hash } = await hashPassword(String(b.oldPassword || ''), user.pass_salt);
  if (!timingSafeEqual(hash, user.pass_hash)) throw new HttpError(400, 'Текущий пароль указан неверно');
  checkPassword(b.newPassword);
  const next = await hashPassword(b.newPassword);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pass_hash = ?, pass_salt = ? WHERE id = ?').bind(next.hash, next.salt, user.id),
    // Выходим на всех остальных устройствах
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(user.id, await sha256(cookie(request, 'sid') || '')),
  ]);
  return json({ ok: true });
}

// ---------- прогресс ----------
async function loadData(env, userId) {
  const row = await env.DB.prepare('SELECT data, updated_at FROM progress WHERE user_id = ?').bind(userId).first();
  return { data: row ? JSON.parse(row.data) : {}, updatedAt: row?.updated_at || 0 };
}

async function getProgress(env, user) {
  return json(await loadData(env, user.id));
}

const KEY_RE = /^[\w.:-]{1,80}$/;
function bucket(data, kind, s) {
  if (!KEY_RE.test(s)) throw new HttpError(400, 'Некорректный предмет');
  data[kind] ??= {};
  data[kind][s] ??= {};
  return data[kind][s];
}

/** Применяет одну операцию к данным пользователя. Те же правила, что и в браузере (assets/js/store.js). */
export function applyOp(data, op) {
  const { k, s, id, v } = op || {};
  if (k !== 'reset' && k !== 'import' && !KEY_RE.test(String(id))) throw new HttpError(400, 'Некорректный ключ');
  switch (k) {
    case 'topic': { const b = bucket(data, 'topics', s); if (v) b[id] = true; else delete b[id]; break; }
    case 'quiz': {
      const p = Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
      const b = bucket(data, 'quizzes', s); const prev = b[id] || { best: 0, attempts: 0 };
      b[id] = { best: Math.max(prev.best, p), last: p, attempts: prev.attempts + 1 };
      break;
    }
    case 'card': { const b = bucket(data, 'cards', s); if (v === 'known' || v === 'again') b[id] = v; else delete b[id]; break; }
    case 'question': { const b = bucket(data, 'questions', s); if (['known', 'review', 'unknown'].includes(v)) b[id] = v; else delete b[id]; break; }
    case 'note': {
      const b = bucket(data, 'notes', s); const text = String(v ?? '').slice(0, MAX_NOTE);
      if (text.trim()) b[id] = text; else delete b[id];
      break;
    }
    case 'answer': {
      // Статистика ответов на вопрос квиза: w — ошибок, r — верных подряд после последней ошибки, t — всего
      const b = bucket(data, 'mistakes', s); const prev = b[id] || { w: 0, r: 0, t: 0 };
      b[id] = v ? { w: prev.w, r: prev.r + 1, t: prev.t + 1 } : { w: prev.w + 1, r: 0, t: prev.t + 1 };
      break;
    }
    case 'reset': {
      if (!KEY_RE.test(s)) throw new HttpError(400, 'Некорректный предмет');
      for (const kind of ['topics', 'quizzes', 'cards', 'questions', 'mistakes']) if (data[kind]) delete data[kind][s];
      break;
    }
    case 'import': mergeState(data, v || {}); break;
    default: throw new HttpError(400, `Неизвестная операция ${k}`);
  }
}

/** Слияние локального прогресса с серверным при первом входе: ничего не теряем. */
function mergeState(data, local) {
  for (const [s, b] of Object.entries(local.topics || {})) for (const id of Object.keys(b || {})) applyOp(data, { k: 'topic', s, id, v: true });
  for (const [s, b] of Object.entries(local.quizzes || {})) {
    for (const [id, r] of Object.entries(b || {})) {
      const t = bucket(data, 'quizzes', s); const prev = t[id] || { best: 0, attempts: 0, last: 0 };
      if (!KEY_RE.test(id)) continue;
      t[id] = { best: Math.max(prev.best, Number(r?.best) || 0), last: prev.attempts ? prev.last : Number(r?.last) || 0, attempts: prev.attempts + (Number(r?.attempts) || 0) };
    }
  }
  for (const kind of ['cards', 'questions', 'notes']) {
    for (const [s, b] of Object.entries(local[kind] || {})) {
      const t = bucket(data, kind, s);
      for (const [id, v] of Object.entries(b || {})) if (KEY_RE.test(id) && t[id] === undefined) t[id] = kind === 'notes' ? String(v).slice(0, MAX_NOTE) : v;
    }
  }
  for (const [s, b] of Object.entries(local.mistakes || {})) {
    const t = bucket(data, 'mistakes', s);
    for (const [id, m] of Object.entries(b || {})) {
      if (!KEY_RE.test(id)) continue;
      const p = t[id] || { w: 0, r: 0, t: 0 };
      t[id] = { w: p.w + (Number(m?.w) || 0), r: Math.max(p.r, Number(m?.r) || 0), t: p.t + (Number(m?.t) || 0) };
    }
  }
}

async function postProgress(request, env, user) {
  const b = await body(request);
  const ops = Array.isArray(b.ops) ? b.ops : [];
  if (ops.length > MAX_OPS) throw new HttpError(413, 'Слишком много изменений за раз');
  const { data } = await loadData(env, user.id);
  for (const op of ops) applyOp(data, op);
  const text = JSON.stringify(data);
  if (text.length > MAX_DATA_BYTES) throw new HttpError(413, 'Слишком много данных');
  const now = Date.now();
  const stmts = [
    env.DB.prepare(`INSERT INTO progress (user_id, data, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`).bind(user.id, text, now),
  ];
  // Сводка для рейтинга: готовность и лучший пробный экзамен по каждому предмету (считает браузер)
  for (const [s, v] of Object.entries(b.summary || {}).slice(0, 50)) {
    if (!KEY_RE.test(s)) continue;
    stmts.push(env.DB.prepare(`INSERT INTO summary (user_id, subject, readiness, exam_best, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, subject) DO UPDATE SET readiness = excluded.readiness, exam_best = excluded.exam_best, updated_at = excluded.updated_at`)
      .bind(user.id, s, clampPct(v?.readiness), v?.examBest == null ? null : clampPct(v.examBest), now));
  }
  await env.DB.batch(stmts);
  return json({ data, updatedAt: now });
}

const clampPct = (n) => Math.max(0, Math.min(100, Math.round(Number(n) || 0)));

// ---------- рейтинг ----------
async function leaderboard(env, url, me) {
  const group = cleanText(url.searchParams.get('group'), 30);
  const rows = (await env.DB.prepare(`SELECT u.id, u.display_name, u.grp, s.subject, s.readiness, s.exam_best
      FROM users u JOIN summary s ON s.user_id = u.id
      WHERE u.show_in_rating = 1 ${group ? 'AND u.grp = ? COLLATE NOCASE' : ''}`)
    .bind(...(group ? [group] : [])).all()).results;
  const people = new Map();
  for (const r of rows) {
    const p = people.get(r.id) || { name: r.display_name, group: r.grp, me: r.id === me?.id, subjects: {} };
    p.subjects[r.subject] = { readiness: r.readiness, examBest: r.exam_best };
    people.set(r.id, p);
  }
  const list = [...people.values()].map((p) => {
    const vals = Object.values(p.subjects).map((x) => x.readiness);
    return { ...p, overall: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0 };
  }).sort((a, b) => b.overall - a.overall).slice(0, 200);
  const groups = (await env.DB.prepare(`SELECT grp, COUNT(*) AS n FROM users WHERE show_in_rating = 1 AND grp != '' GROUP BY grp COLLATE NOCASE ORDER BY n DESC LIMIT 50`).all()).results;
  return json({ list, groups: groups.map((g) => g.grp) });
}

// ---------- админка: правка контента коммитом в GitHub ----------
const CONTENT_PATH_RE = /^content\/[\w-]+(\/[\w-]+)*\.(json|md)$/;

function githubConfig(env) {
  if (!env.GITHUB_TOKEN) throw new HttpError(503, 'Не настроен GITHUB_TOKEN — правка контента недоступна');
  return { token: env.GITHUB_TOKEN, repo: env.GITHUB_REPO || 'kapustazer123/enu', branch: env.GITHUB_BRANCH || 'main' };
}

async function github(env, method, apiPath, payload) {
  const { token } = githubConfig(env);
  const res = await fetch(`${env.GITHUB_API || 'https://api.github.com'}${apiPath}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'prep-portal-worker',
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

const utf8ToB64 = (text) => { const bytes = new TextEncoder().encode(text); let bin = ''; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin); };
const b64ToUtf8 = (b) => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

function checkContentPath(p) {
  const path = String(p || '');
  if (!CONTENT_PATH_RE.test(path) || path.includes('..')) throw new HttpError(400, 'Можно править только .json и .md внутри content/');
  return path;
}

async function adminReadFile(env, url) {
  const path = checkContentPath(url.searchParams.get('path'));
  const { repo, branch } = githubConfig(env);
  const r = await github(env, 'GET', `/repos/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`);
  if (r.status === 404) return json({ path, exists: false, content: '', sha: null });
  if (r.status !== 200) throw new HttpError(502, `GitHub: ${r.data.message || r.status}`);
  return json({ path, exists: true, content: b64ToUtf8(r.data.content || ''), sha: r.data.sha });
}

async function adminWriteFile(request, env, user) {
  const b = await body(request);
  const path = checkContentPath(b.path);
  const content = String(b.content ?? '');
  if (content.length > 900_000) throw new HttpError(413, 'Файл слишком большой');
  if (path.endsWith('.json')) {
    try { JSON.parse(content); } catch (e) { throw new HttpError(400, `Ошибка в JSON: ${e.message}`); }
  }
  const { repo, branch } = githubConfig(env);
  const message = `${cleanText(b.message, 120) || `Правка ${path}`}\n\nЧерез админку портала: ${user.username}`;
  const r = await github(env, 'PUT', `/repos/${repo}/contents/${path}`, {
    message, content: utf8ToB64(content), branch, ...(b.sha ? { sha: b.sha } : {}),
  });
  if (r.status === 409 || r.status === 422) throw new HttpError(409, 'Файл успел измениться — откройте его заново и повторите правку');
  if (r.status !== 200 && r.status !== 201) throw new HttpError(502, `GitHub: ${r.data.message || r.status}`);
  return json({ ok: true, sha: r.data.content?.sha, commit: r.data.commit?.html_url });
}

async function adminResetPassword(request, env) {
  const b = await body(request);
  checkPassword(b.newPassword);
  const target = await env.DB.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').bind(String(b.username || '').trim()).first();
  if (!target) throw new HttpError(404, 'Пользователь не найден');
  const { hash, salt } = await hashPassword(b.newPassword);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pass_hash = ?, pass_salt = ?, failed_logins = 0, locked_until = 0 WHERE id = ?').bind(hash, salt, target.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(target.id),
  ]);
  return json({ ok: true });
}

async function adminStats(env) {
  const users = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
  const active = await env.DB.prepare('SELECT COUNT(*) AS n FROM progress WHERE updated_at > ?').bind(Date.now() - 7 * 86400000).first();
  return json({ users: users.n, activeWeek: active.n, githubConfigured: !!env.GITHUB_TOKEN });
}

// ---------- ссылки на онлайн-занятия (закрытые, только для своей группы) ----------
const MAX_CODE_ATTEMPTS = 20;

async function getSetting(env, key) {
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return row ? row.value : null;
}
function setSetting(env, key, value) {
  return env.DB.prepare(`INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).bind(key, value, Date.now());
}

async function hasLinkAccess(env, user) {
  if (user.is_admin) return true;
  return !!(await env.DB.prepare('SELECT 1 FROM link_access WHERE user_id = ?').bind(user.id).first());
}

async function getLinks(env, user) {
  if (!(await hasLinkAccess(env, user))) throw new HttpError(403, 'Нужен код группы');
  return json({ links: JSON.parse((await getSetting(env, 'lesson_links')) || '[]') });
}

async function unlockLinks(request, env, user) {
  if (await hasLinkAccess(env, user)) return json({ ok: true });
  const attempts = (await env.DB.prepare('SELECT n FROM code_attempts WHERE user_id = ?').bind(user.id).first())?.n || 0;
  if (attempts >= MAX_CODE_ATTEMPTS) throw new HttpError(429, 'Слишком много попыток. Попросите администратора открыть доступ.');
  const b = await body(request);
  const code = await getSetting(env, 'group_code');
  const given = String(b.code || '').trim().toLowerCase();
  if (!code || !given || !timingSafeEqual(await sha256(given), await sha256(code.toLowerCase()))) {
    await env.DB.prepare(`INSERT INTO code_attempts (user_id, n) VALUES (?, 1) ON CONFLICT(user_id) DO UPDATE SET n = n + 1`).bind(user.id).run();
    throw new HttpError(400, 'Неверный код группы');
  }
  await env.DB.prepare('INSERT OR IGNORE INTO link_access (user_id, granted_at) VALUES (?, ?)').bind(user.id, Date.now()).run();
  return json({ ok: true });
}

const DAY_RE = /^(пн|вт|ср|чт|пт|сб|вс|[1-7])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function cleanLinks(list) {
  if (!Array.isArray(list) || list.length > 200) throw new HttpError(400, 'Ожидается массив ссылок (до 200)');
  return list.map((l, i) => {
    const where = `Ссылка ${i + 1}`;
    let url;
    try { url = new URL(String(l.url)); } catch { throw new HttpError(400, `${where}: некорректный url`); }
    if (url.protocol !== 'https:') throw new HttpError(400, `${where}: нужен https-адрес`);
    if (!KEY_RE.test(String(l.subject || ''))) throw new HttpError(400, `${where}: subject — id предмета`);
    const day = String(l.day || '').toLowerCase();
    if (!DAY_RE.test(day)) throw new HttpError(400, `${where}: day — пн…вс`);
    if (!TIME_RE.test(String(l.start || ''))) throw new HttpError(400, `${where}: start в формате ЧЧ:ММ`);
    return { subject: l.subject, type: cleanText(l.type, 30), day, start: l.start, end: TIME_RE.test(String(l.end || '')) ? l.end : '', platform: cleanText(l.platform, 40), url: url.href };
  });
}

async function adminGetLinks(env) {
  const access = await env.DB.prepare('SELECT COUNT(*) AS n FROM link_access').first();
  return json({
    links: JSON.parse((await getSetting(env, 'lesson_links')) || '[]'),
    code: (await getSetting(env, 'group_code')) || '',
    accessCount: access.n,
  });
}

async function adminPutLinks(request, env) {
  const b = await body(request);
  const stmts = [];
  if (b.links !== undefined) stmts.push(setSetting(env, 'lesson_links', JSON.stringify(cleanLinks(b.links))));
  if (b.code !== undefined) {
    const code = cleanText(b.code, 40);
    if (code && code.length < 6) throw new HttpError(400, 'Код группы — минимум 6 символов');
    stmts.push(setSetting(env, 'group_code', code));
  }
  if (b.revokeAll) stmts.push(env.DB.prepare('DELETE FROM link_access'), env.DB.prepare('DELETE FROM code_attempts'));
  if (stmts.length) await env.DB.batch(stmts);
  return adminGetLinks(env);
}
