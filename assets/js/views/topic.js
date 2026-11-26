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
      <div class="breadcrumbs"><a href="#/">Предметы</a> / <a href="#/s/${esc(s.id)}">${esc(s.title)}</a> / Тема ${idx + 1}</div>
      <article class="prose">${md(text)}</article>

      <div class="btn-row">
        <button class="btn ${done ? 'ok' : 'primary'}" id="toggle-done">${done ? '✓ Изучено' : 'Отметить как изученное'}</button>
        ${relatedQuizzes.map((q) => `<a class="btn" href="#/s/${esc(s.id)}/quiz/${esc(q.id)}">Квиз: ${esc(q.title)}</a>`).join('')}
      </div>

      <nav class="topic-nav">
        ${prev ? `<a class="btn" href="#/s/${esc(s.id)}/topic/${esc(prev.id)}">← ${esc(prev.title)}</a>` : '<span></span>'}
        ${next ? `<a class="btn" href="#/s/${esc(s.id)}/topic/${esc(next.id)}">${esc(next.title)} →</a>` : `<a class="btn" href="#/s/${esc(s.id)}">К предмету</a>`}
      </nav>
    `;
    app.querySelector('#toggle-done').addEventListener('click', () => {
      store.setTopicDone(s.id, topic.id, !done);
      draw();
    });
  };
  draw();
}
