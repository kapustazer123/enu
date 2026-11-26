import { api } from '../api.js';
import { auth } from '../auth.js';
import { pushSummary } from '../store.js';
import { getAllSubjects } from '../content.js';
import { esc, progressBar } from '../utils.js';

export async function renderRating(app, params) {
  const group = params.get('group') || '';
  if (auth.user) await pushSummary(); // свежая сводка перед показом
  const [{ subjects }, data] = await Promise.all([
    getAllSubjects(),
    api.get(`/api/leaderboard${group ? `?group=${encodeURIComponent(group)}` : ''}`).catch((e) => ({ error: e.message })),
  ]);

  const head = `
    <div class="page-head">
      <span class="label">Рейтинг</span>
      <h1>Готовность к сессии</h1>
      <p class="lead">Средняя готовность по предметам: изученные темы, результаты квизов, выученные карточки и билеты.${auth.user ? '' : ' <a href="#/account?mode=register">Зарегистрируйтесь</a>, чтобы попасть в рейтинг.'}</p>
    </div>`;

  if (data.error) {
    app.innerHTML = head + `<div class="notice">${esc(data.error)}. Рейтинг работает только на опубликованном сайте.</div>`;
    return;
  }

  const shown = subjects.filter((s) => data.list.some((p) => p.subjects[s.id]));
  const groups = data.groups || [];

  app.innerHTML = head + `
    ${groups.length ? `<div class="tabs" role="tablist">
      <a class="tab-link ${!group ? 'active' : ''}" href="#/rating">Все</a>
      ${groups.map((g) => `<a class="tab-link ${g.toLowerCase() === group.toLowerCase() ? 'active' : ''}" href="#/rating?group=${encodeURIComponent(g)}">${esc(g)}</a>`).join('')}
    </div>` : ''}
    ${data.list.length ? `<div class="table-wrap"><table class="table rating-table">
      <thead><tr>
        <th>№</th><th>Имя</th><th class="hide-sm">Группа</th>
        ${shown.map((s) => `<th class="hide-sm num" title="${esc(s.title)}">${esc(s.code || s.id)}</th>`).join('')}
        <th style="width:30%">Готовность</th>
      </tr></thead>
      <tbody>${data.list.map((p, i) => `
        <tr class="${p.me ? 'me' : ''}">
          <td class="rank">${i + 1}</td>
          <td><strong>${esc(p.name)}</strong>${p.me ? ' <span class="tag primary">вы</span>' : ''}<div class="small muted sm-only">${esc(p.group || '')}</div></td>
          <td class="hide-sm">${esc(p.group || '—')}</td>
          ${shown.map((s) => {
            const v = p.subjects[s.id];
            return `<td class="hide-sm num mono small">${v ? `${v.readiness}%${v.examBest != null ? `<div class="muted" title="Лучший пробный экзамен">экз. ${v.examBest}%</div>` : ''}` : '—'}</td>`;
          }).join('')}
          <td>${progressBar(p.overall)}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>` : '<div class="empty">Пока никого нет. Зарегистрируйтесь и начните готовиться — вы будете первым.</div>'}
    ${auth.user && !auth.user.showInRating ? '<p class="hint">Вас нет в рейтинге — это можно изменить в <a href="#/account">настройках аккаунта</a>.</p>' : ''}
  `;
}
