import { getAllSubjects, getTopicText, getFlashcards, getQuestions } from '../content.js';
import { esc } from '../utils.js';

// Простой полнотекстовый поиск по темам, вопросам и карточкам всех предметов.

async function buildIndex() {
  const { subjects } = await getAllSubjects();
  const docs = [];
  await Promise.all(subjects.map(async (s) => {
    const [texts, cards, questions] = await Promise.all([
      Promise.all(s.topics.map((t) => getTopicText(s, t).catch(() => ''))),
      getFlashcards(s).catch(() => []),
      getQuestions(s).catch(() => []),
    ]);
    s.topics.forEach((t, i) => docs.push({ kind: 'Тема', subject: s, title: t.title, text: texts[i], href: `#/s/${s.id}/topic/${t.id}` }));
    questions.forEach((q) => docs.push({ kind: 'Билет', subject: s, title: `${q.id}. ${q.q}`, text: `${q.q}\n${q.a || ''}`, href: `#/s/${s.id}/questions` }));
    cards.forEach((c) => docs.push({ kind: 'Карточка', subject: s, title: c.front, text: `${c.front}\n${c.back}`, href: `#/s/${s.id}/cards` }));
  }));
  return docs;
}

function snippet(text, q) {
  const plain = text.replace(/[#*_`>$\\]/g, '').replace(/\s+/g, ' ');
  const i = plain.toLowerCase().indexOf(q);
  if (i < 0) return esc(plain.slice(0, 140));
  const start = Math.max(0, i - 60);
  const part = plain.slice(start, i + q.length + 80);
  const j = i - start;
  return (start ? '…' : '') + esc(part.slice(0, j)) + '<mark>' + esc(part.slice(j, j + q.length)) + '</mark>' + esc(part.slice(j + q.length)) + '…';
}

export async function renderSearch(app, params) {
  app.innerHTML = `
    <div class="page-head" style="margin-bottom:var(--s4)">
      <span class="label">Поиск</span>
      <label for="q" class="visually-hidden">Поиск по материалам</label>
      <input class="search-input" id="q" type="search" placeholder="Термин, формула, тема…" autocomplete="off" value="${esc(params.get('q') || '')}">
    </div>
    <div id="results"><p class="muted">Индексирую материалы…</p></div>
  `;
  const input = app.querySelector('#q');
  const out = app.querySelector('#results');
  const docs = await buildIndex();

  function run() {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) {
      out.innerHTML = `<p class="muted">Введите хотя бы 2 символа. В индексе ${docs.length} материалов.</p>`;
      return;
    }
    const hits = docs.filter((d) => d.text.toLowerCase().includes(q) || d.title.toLowerCase().includes(q)).slice(0, 50);
    out.innerHTML = hits.length
      ? `<p class="small muted mono">найдено: ${hits.length}</p><ul class="rows" style="border-top:1px solid var(--rule)">${hits.map((d) => `
          <li><a class="row" href="${esc(d.href)}"><span class="grow">
            <span class="label">${d.kind} · ${esc(d.subject.title)}</span>
            <div class="row-title">${esc(d.title.slice(0, 120))}</div>
            <div class="row-sub">${snippet(d.text, q)}</div>
          </span></a></li>`).join('')}</ul>`
      : '<div class="empty">Ничего не найдено.</div>';
  }

  let t;
  input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(run, 150); });
  input.focus();
  run();
  return () => clearTimeout(t);
}
