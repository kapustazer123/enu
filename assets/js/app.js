// Точка входа: роутер по hash (#/...), работает на GitHub Pages без сборки.

import { esc } from './utils.js';
import { getTheme, setTheme } from './store.js';
import { renderHome } from './views/home.js';
import { renderSubject } from './views/subject.js';
import { renderTopic } from './views/topic.js';
import { renderQuiz } from './views/quiz.js';
import { renderCards } from './views/cards.js';
import { renderQuestions } from './views/questions.js';
import { renderSchedule } from './views/schedule.js';
import { renderSearch } from './views/search.js';
import { renderTimetable } from './views/timetable.js';

const routes = [
  [/^\/?$/, renderHome, 'home'],
  [/^\/schedule$/, renderSchedule, 'schedule'],
  [/^\/timetable$/, renderTimetable, 'timetable'],
  [/^\/search$/, renderSearch, 'search'],
  [/^\/s\/([\w-]+)$/, renderSubject],
  [/^\/s\/([\w-]+)\/topic\/([\w-]+)$/, renderTopic],
  [/^\/s\/([\w-]+)\/quiz\/([\w-]+)$/, renderQuiz],
  [/^\/s\/([\w-]+)\/cards$/, renderCards],
  [/^\/s\/([\w-]+)\/questions$/, renderQuestions],
];

const app = document.getElementById('app');
let cleanup = null;
let renderId = 0;

async function router() {
  const [path, query = ''] = (location.hash.slice(1) || '/').split('?');
  const params = new URLSearchParams(query);
  const id = ++renderId;

  if (typeof cleanup === 'function') cleanup();
  cleanup = null;

  const match = routes.find(([re]) => re.test(path));
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', !!match && a.dataset.nav === match[2]));

  if (!match) {
    app.innerHTML = `<div class="page-head"><span class="label">Ошибка 404</span><h1>Страница не найдена</h1><p><a href="#/">На главную</a></p></div>`;
    return;
  }

  const [re, view] = match;
  const args = path.match(re).slice(1);
  app.innerHTML = '<p class="muted">Загрузка…</p>';
  try {
    const result = await view(app, ...args, params);
    if (id !== renderId) { if (typeof result === 'function') result(); return; }
    cleanup = result;
    if (!params.has('keep-scroll')) window.scrollTo(0, 0);
  } catch (err) {
    if (id !== renderId) return;
    console.error(err);
    app.innerHTML = `<div class="page-head"><span class="label">Ошибка</span><h1>Не удалось открыть страницу</h1></div><div class="error-box"><p>${esc(err.message)}</p><p><a href="#/">На главную</a></p></div>`;
  }
}

// Тема
const themeBtn = document.getElementById('theme-toggle');
function applyTheme(t) {
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const dark = (t || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark';
  themeBtn.textContent = dark ? 'Светлая' : 'Тёмная';
}
applyTheme(getTheme());
document.getElementById('theme-toggle').addEventListener('click', () => {
  const current = document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  setTheme(next);
});

if (!window.marked) {
  console.warn('marked не загрузился — markdown будет показан как текст');
} else {
  window.marked.setOptions({ gfm: true, breaks: false });
}

window.addEventListener('hashchange', router);
router();
