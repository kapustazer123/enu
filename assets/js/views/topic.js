import { getSubject, getTopicText } from '../content.js';
import { store } from '../store.js';
import { esc, md } from '../utils.js';

export async function renderTopic(app, subjectId, topicId) {
  const s = await getSubject(subjectId);
  const idx = s.topics.findIndex((t) => t.id === topicId);
  if (idx < 0) throw new Error(`Тема «${topicId}» не найдена в предмете «${s.title}»`);
  const topic = s.topics[idx];
  const text = await getTopicText(s, topic);
  const prev = s.topics[idx - 1];
  const next = s.topics[idx + 1];
  const relatedQuizzes = s.quizzes.filter((q) => q.topic === topic.id);

  const draw = () => {
    const done = store.isTopicDone(s.id, topic.id);
    app.innerHTML = `
      <div class="breadcrumbs"><a href="#/">Предметы</a> / <a href="#/s/${esc(s.id)}">${esc(s.title)}</a></div>
      <span class="label" style="display:block;margin-bottom:var(--s3)">Тема ${idx + 1} из ${s.topics.length}</span>
      <article class="prose sheet">${md(text)}</article>

      <div class="btn-row">
        <button class="btn ${done ? 'ok on' : 'primary'}" id="toggle-done" type="button">${done ? '✓ Изучено' : 'Отметить как изученное'}</button>
        ${relatedQuizzes.map((q) => `<a class="btn" href="#/s/${esc(s.id)}/quiz/${esc(q.id)}">Квиз: ${esc(q.title)}</a>`).join('')}
      </div>

      <nav class="pager" aria-label="Темы">
        ${prev ? `<a href="#/s/${esc(s.id)}/topic/${esc(prev.id)}"><span class="label">← Предыдущая</span><span class="pager-title">${esc(prev.title)}</span></a>` : ''}
        ${next
          ? `<a class="next" href="#/s/${esc(s.id)}/topic/${esc(next.id)}"><span class="label">Следующая →</span><span class="pager-title">${esc(next.title)}</span></a>`
          : `<a class="next" href="#/s/${esc(s.id)}"><span class="label">Это последняя тема</span><span class="pager-title">К предмету →</span></a>`}
      </nav>
    `;
    app.querySelector('#toggle-done').addEventListener('click', () => {
      store.setTopicDone(s.id, topic.id, !done);
      draw();
    });
  };
  draw();
}
