import { auth } from '../auth.js';
import { api } from '../api.js';
import { sync } from '../store.js';
import { esc } from '../utils.js';

const STATUS_TEXT = {
  synced: 'Прогресс сохранён в аккаунте',
  pending: 'Сохраняю изменения…',
  offline: 'Нет связи — изменения сохранятся, когда появится интернет',
  local: 'Прогресс хранится только в этом браузере',
};

export async function renderAccount(app, params) {
  let mode = params.get('mode') === 'register' ? 'register' : 'login';
  let message = '';

  function field(name, label, attrs = '') {
    return `<label class="field"><span class="label">${label}</span><input class="input" name="${name}" ${attrs}></label>`;
  }

  function drawGuest() {
    app.innerHTML = `
      <div class="page-head">
        <span class="label">Аккаунт</span>
        <h1>${mode === 'login' ? 'Вход' : 'Регистрация'}</h1>
        <p class="lead">С аккаунтом прогресс, заметки и статистика ошибок сохраняются на сервере и доступны с любого устройства. Без входа всё работает, но только в этом браузере.</p>
      </div>
      ${!auth.available ? '<div class="notice">Сервер аккаунтов сейчас недоступен — портал работает в локальном режиме.</div>' : ''}
      <div class="tabs" role="tablist">
        <button type="button" data-mode="login" class="${mode === 'login' ? 'active' : ''}">Вход</button>
        <button type="button" data-mode="register" class="${mode === 'register' ? 'active' : ''}">Регистрация</button>
      </div>
      <form class="form" id="auth-form" novalidate>
        ${field('username', 'Логин', 'autocomplete="username" required minlength="3" maxlength="32" pattern="[a-zA-Z0-9_.-]+" autocapitalize="none" spellcheck="false"')}
        ${mode === 'register' ? '<p class="hint" style="margin-top:calc(-1 * var(--s2))">Латиница, цифры, точка, дефис, подчёркивание; 3–32 символа.</p>' : ''}
        ${field('password', 'Пароль', `type="password" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" required minlength="8"`)}
        ${mode === 'register' ? `
          ${field('displayName', 'Имя в рейтинге', 'autocomplete="nickname" maxlength="60" placeholder="Как вас показывать другим"')}
          ${field('group', 'Группа', 'maxlength="30" placeholder="Например, ТУР-21"')}
          <p class="hint" style="margin-top:0">Имя и группа видны в рейтинге. Скрыть себя можно в настройках аккаунта.</p>
        ` : ''}
        ${message ? `<div class="error-box" role="alert">${esc(message)}</div>` : ''}
        <div class="btn-row"><button class="btn primary" type="submit">${mode === 'login' ? 'Войти' : 'Создать аккаунт'}</button></div>
        ${mode === 'login' ? '<p class="hint">Забыли пароль? Напишите администратору портала — он сбросит его.</p>' : ''}
      </form>
    `;
    app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { mode = b.dataset.mode; message = ''; drawGuest(); }));
    const form = app.querySelector('#auth-form');
    form.querySelector('input').focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(form));
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true;
      try {
        if (mode === 'login') await auth.login(data.username, data.password);
        else await auth.register(data);
        if (location.hash.startsWith('#/account')) location.hash = '#/';
      } catch (err) {
        message = err.message;
        drawGuest();
        app.querySelector(`input[name=${mode === 'login' ? 'password' : 'username'}]`)?.focus();
      }
    });
  }

  function drawUser() {
    const u = auth.user;
    app.innerHTML = `
      <div class="page-head">
        <span class="label">Аккаунт · ${esc(u.username)}</span>
        <h1>${esc(u.displayName)}</h1>
        <p class="lead" id="sync-status">${STATUS_TEXT[sync.status] || ''}</p>
      </div>

      <section class="section">
        <div class="section-head"><h2>Профиль</h2></div>
        <form class="form" id="profile-form">
          ${field('displayName', 'Имя в рейтинге', `maxlength="60" value="${esc(u.displayName)}"`)}
          ${field('group', 'Группа', `maxlength="30" value="${esc(u.group || '')}"`)}
          <label class="check-field"><input type="checkbox" name="showInRating" ${u.showInRating ? 'checked' : ''}> Показывать меня в рейтинге</label>
          <div class="btn-row"><button class="btn primary" type="submit">Сохранить</button><span class="small muted" id="profile-msg" role="status"></span></div>
        </form>
      </section>

      <section class="section">
        <div class="section-head"><h2>Пароль</h2></div>
        <form class="form" id="password-form">
          ${field('oldPassword', 'Текущий пароль', 'type="password" autocomplete="current-password" required')}
          ${field('newPassword', 'Новый пароль', 'type="password" autocomplete="new-password" required minlength="8"')}
          <div class="btn-row"><button class="btn" type="submit">Сменить пароль</button><span class="small muted" id="password-msg" role="status"></span></div>
        </form>
      </section>

      <div class="btn-row" style="margin-top:var(--s7)">
        ${u.isAdmin ? '<a class="btn" href="#/admin">Админка</a>' : ''}
        <button class="btn quiet" type="button" id="logout">Выйти из аккаунта</button>
      </div>
    `;

    app.querySelector('#profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target; const msg = app.querySelector('#profile-msg');
      try {
        await auth.update({ displayName: f.displayName.value, group: f.group.value, showInRating: f.showInRating.checked });
        msg.textContent = 'Сохранено';
      } catch (err) { msg.textContent = err.message; }
    });
    app.querySelector('#password-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.target; const msg = app.querySelector('#password-msg');
      try {
        await api.post('/api/password', { oldPassword: f.oldPassword.value, newPassword: f.newPassword.value });
        f.reset(); msg.textContent = 'Пароль изменён. На других устройствах нужно будет войти заново.';
      } catch (err) { msg.textContent = err.message; }
    });
    app.querySelector('#logout').addEventListener('click', async () => { await auth.logout(); location.hash = '#/'; });
  }

  const draw = () => (auth.user ? drawUser() : drawGuest());
  draw();
  const off = sync.onChange((s) => { const el = app.querySelector('#sync-status'); if (el) el.textContent = STATUS_TEXT[s] || ''; });
  return off;
}
