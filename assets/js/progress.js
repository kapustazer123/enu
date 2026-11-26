// Подсчёт готовности по предмету: темы, квизы, карточки, вопросы.

import { store } from './store.js';
import { getFlashcards, getQuestions } from './content.js';
import { pct } from './utils.js';

export async function subjectStats(subject) {
  const [cards, questions] = await Promise.all([
    getFlashcards(subject).catch(() => []),
    getQuestions(subject).catch(() => []),
  ]);

  const topicsDone = subject.topics.filter((t) => store.isTopicDone(subject.id, t.id)).length;
  const quizBest = subject.quizzes.map((q) => store.quizResult(subject.id, q.id)?.best ?? 0);
  const cardsKnown = cards.filter((c) => store.cardStatus(subject.id, c.id) === 'known').length;
  const qKnown = questions.filter((q) => store.questionStatus(subject.id, q.id) === 'known').length;

  const parts = [];
  if (subject.topics.length) parts.push(pct(topicsDone, subject.topics.length));
  if (quizBest.length) parts.push(quizBest.reduce((a, b) => a + b, 0) / quizBest.length);
  if (cards.length) parts.push(pct(cardsKnown, cards.length));
  if (questions.length) parts.push(pct(qKnown, questions.length));

  return {
    topics: { done: topicsDone, total: subject.topics.length },
    quizzes: { avgBest: quizBest.length ? Math.round(quizBest.reduce((a, b) => a + b, 0) / quizBest.length) : 0, total: quizBest.length },
    cards: { known: cardsKnown, total: cards.length },
    questions: { known: qKnown, total: questions.length },
    readiness: parts.length ? Math.round(parts.reduce((a, b) => a + b, 0) / parts.length) : 0,
  };
}
