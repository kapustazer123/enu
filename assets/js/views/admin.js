// Админка: правка файлов контента (коммит в GitHub через Worker) и сброс паролей.

import { api } from '../api.js';
import { auth } from '../auth.js';
import { getAllSubjects } from '../content.js';
import { esc, md } from '../utils.js';

async function fileList() {
  const { subjects } = await getAllSubjects();
  const groups = [{ title: 'Общее', files: [['content/subjects.json', 'Список предметов и календарь'], ['content/timetable.json', 'Расписание занятий']] }];
  for (const s of subjects) {
    const files = [[`${s.base}subject.json`, 'Настройки предмета (темы, квизы, экзамен)']];
    for (const t of s.topics) files.push([s.base + t.file, `Конспект: ${t.title}`]);
    for (const q of s.quizzes) files.push([s.base + q.file, `Квиз: ${q.title}`]);
    if (s.questions) files.push([s.base + s.questions, 'Вопросы к экзамену']);
    if (s.flashcards) files.push([s.base + s.flashcards, 'Карточки']);
    groups.push({ title: s.title, files });
  }
  return groups;
}

export async function renderAdmin(app) {
  if (!auth.user?.isAdmin) {
    app.innerHTML = `<div class="page-head"><span class="label">Админка</span><h1>Нет доступа</h1>
      <p class="lead">Эта страница только для администраторов портала.</p></div>`;
    return;
  }
  const [stats, groups] = await Promise.all([api.get('/api/admin/stats').catch((e) => ({ error: e.message })), fileList()]);
  let file = null; // { path, content, sha, exists }
  let preview = false;
  let msg = '';

  function draw() {
    app.innerHTML = `
      <div class="page-head">
        <span class="label">Админка</span>
        <h1>Контент и пользователи</h1>
        <p class="lead">${stats.error ? esc(stats.error) : `Пользователей: ${stats.users} · активны за неделю: ${stats.activeWeek}`}</p>
      </div>
      ${stats.githubConfigured === false ? `<div class="notice">Правка контента не настроена: добавьте секрет <code>GITHUB_TOKEN</code> в настройках Worker в Cloudflare.</div>` : ''}

      <section class="section">
        <div class="section-head"><h2>Файлы контента</h2></div>
        <div class="form" style="max-width:none">
          <label class="field"><span class="label">Файл</span>
            <select class="input" id="file-select">
              <option value="">— выберите файл —</option>
              ${groups.map((g) => `<optgroup label="${esc(g.title)}">${g.files.map(([p, t]) => `<option value="${esc(p)}" ${file?.path === p ? 'selected' : ''}>${esc(t)} — ${esc(p.replace('content/', ''))}</option>`).join('')}</optgroup>`).join('')}
            </select>
          </label>
          <label class="field"><span class="label">Или путь к новому файлу</span>
            <div style="display:flex;gap:var(--s2)"><input class="input" id="new-path" placeholder="content/edt/topics/15-extra.md"><button class="btn" type="button" id="open-path">Открыть</button></div>
          </label>
        </div>
        ${file ? `
          <div style="margin-top:var(--s5)">
            <div class="toolbar">
              <div class="mono small">${esc(file.path)} ${file.exists ? '' : '<span class="tag warn">новый файл</span>'}</div>
              ${file.path.endsWith('.md') ? `<button class="btn sm" type="button" id="toggle-preview">${preview ? 'Редактор' : 'Предпросмотр'}</button>` : ''}
            </div>
            ${preview
              ? `<article class="prose sheet">${md(app.querySelector('#editor')?.value ?? file.content)}</article>`
              : `<textarea class="input mono" id="editor" spellcheck="false" style="min-height:420px;font-size:.8125rem;line-height:1.55;white-space:pre;overflow-wrap:normal">${esc(file.content)}</textarea>`}
            <div class="form" style="max-width:none;margin-top:var(--s4)">
              <label class="field"><span class="label">Описание правки</span><input class="input" id="commit-msg" maxlength="120" placeholder="Например: исправил ответ на билет 12"></label>
              ${msg ? `<div class="${msg.startsWith('✓') ? 'notice' : 'error-box'}" role="status">${msg}</div>` : ''}
              <div class="btn-row" style="margin-top:0">
                <button class="btn primary" type="button" id="save">Сохранить и опубликовать</button>
                <button class="btn" type="button" id="check">Проверить</button>
              </div>
              <p class="hint">Сохранение — это коммит в репозиторий. Сайт обновится примерно через минуту, после сборки в Cloudflare.</p>
            </div>
          </div>` : ''}
      </section>

      <section class="section">
        <div class="section-head"><h2>Сброс пароля</h2></div>
        <form class="form" id="reset-form">
          <label class="field"><span class="label">Логин студента</span><input class="input" name="username" required autocapitalize="none"></label>
          <label class="field"><span class="label">Новый пароль</span><input class="input" name="newPassword" required minlength="8"></label>
          <div class="btn-row" style="margin-top:0"><button class="btn" type="submit">Сбросить пароль</button><span class="small muted" id="reset-msg" role="status"></span></div>
        </form>
      </section>
    `;
    bind();
  }

  async function open(path) {
    msg = '';
    try {
      file = await api.get(`/api/admin/file?path=${encodeURIComponent(path)}`);
      if (!file.exists && path.endsWith('.json')) file.content = '';
      preview = false;
    } catch (e) { file = null; msg = ''; alert(e.message); }
    draw();
  }

  function check(text) {
    if (!file.path.endsWith('.json')) return '';
    try { JSON.parse(text); return ''; } catch (e) { return `Ошибка в JSON: ${e.message}`; }
  }

  function bind() {
    app.querySelector('#file-select').addEventListener('change', (e) => e.target.value && open(e.target.value));
    app.querySelector('#open-path').addEventListener('click', () => { const v = app.querySelector('#new-path').value.trim(); if (v) open(v); });
    app.querySelector('#toggle-preview')?.addEventListener('click', () => {
      const ed = app.querySelector('#editor'); if (ed) file.content = ed.value;
      preview = !preview; draw();
    });
    app.querySelector('#check')?.addEventListener('click', () => {
      const ed = app.querySelector('#editor'); if (ed) file.content = ed.value;
      msg = check(file.content) || '✓ Ошибок не найдено'; draw();
    });
    app.querySelector('#save')?.addEventListener('click', async (e) => {
      const ed = app.querySelector('#editor'); if (ed) file.content = ed.value;
      const err = check(file.content);
      if (err) { msg = esc(err); draw(); return; }
      e.target.disabled = true;
      try {
        const r = await fetchPut(file.path, file.content, file.sha, app.querySelector('#commit-msg').value);
        file.sha = r.sha; file.exists = true;
        msg = `✓ Сохранено.${r.commit ? ` <a href="${esc(r.commit)}" target="_blank" rel="noopener">Коммит</a>.` : ''} Сайт обновится примерно через минуту.`;
      } catch (ex) { msg = esc(ex.message); }
      draw();
    });
    app.querySelector('#reset-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target; const out = app.querySelector('#reset-msg');
      try { await api.post('/api/admin/reset-password', { username: f.username.value, newPassword: f.newPassword.value }); out.textContent = 'Пароль сброшен, все сессии студента завершены.'; f.reset(); }
      catch (ex) { out.textContent = ex.message; }
    });
  }

  draw();
}

async function fetchPut(path, content, sha, message) {
  return api.put('/api/admin/file', { path, content, sha, message });
}
