import { getSubject, getQuiz } from '../content.js';
import { store } from '../store.js';
import { esc, md, mdInline, shuffle, pct, normalizeAnswer, LETTERS } from '../utils.js';

// Типы вопросов:
//   single    — один правильный вариант:   "answer": 1           (индекс с нуля)
//   multiple  — несколько правильных:      "answer": [0, 2]
//   truefalse — верно/неверно:             "answer": true
//   text      — ввод ответа:               "answer": "42" или ["42", "сорок два"]
// Тип можно не указывать — он определится по полю answer.

function detectType(q) {
  if (q.type) return q.type;
  if (typeof q.answer === 'boolean') return 'truefalse';
  if (Array.isArray(q.answer) && q.options) return 'multiple';
  if (q.options) return 'single';
  return 'text';
}

function prepare(q, quiz) {
  const type = detectType(q);
  if (type === 'text') {
    return { q, type, accepted: [].concat(q.answer).map(normalizeAnswer) };
  }
  const options = type === 'truefalse' ? ['Верно', 'Неверно'] : q.options;
  const correct = new Set(type === 'truefalse' ? [q.answer ? 0 : 1] : [].concat(q.answer));
  let order = options.map((_, i) => i);
  if (type !== 'truefalse' && q.shuffleOptions !== false && quiz.shuffleOptions !== false) order = shuffle(order);
  return { q, type, options, correct, order };
}

export async function renderQuiz(app, subjectId, quizId) {
  const s = await getSubject(subjectId);
  const meta = s.quizzes.find((q) => q.id === quizId);
  if (!meta) throw new Error(`Квиз «${quizId}» не найден`);
  const quiz = await getQuiz(s, meta);
  const all = quiz.questions || [];
  if (!all.length) throw new Error('В квизе нет вопросов');

  let run;

  function start(pool, isFull) {
    let ordered = quiz.shuffle === false ? pool : shuffle(pool);
    // sample: в каждой попытке — новая случайная выборка (режим «пробный экзамен»)
    if (isFull && quiz.sample && quiz.sample < pool.length) ordered = shuffle(pool).slice(0, quiz.sample);
    run = { items: ordered.map((q) => prepare(q, quiz)), i: 0, sel: new Set(), text: '', checked: false, results: [], isFull };
    draw();
  }

  function isCorrect(item) {
    if (item.type === 'text') return item.accepted.includes(normalizeAnswer(run.text));
    return run.sel.size === item.correct.size && [...run.sel].every((x) => item.correct.has(x));
  }

  function check() {
    const item = run.items[run.i];
    if (run.checked) return;
    if (item.type === 'text' ? !run.text.trim() : !run.sel.size) return;
    run.checked = true;
    run.results.push({ item, ok: isCorrect(item), given: item.type === 'text' ? run.text : [...run.sel] });
    draw();
  }

  function nextQ() {
    run.i++;
    run.sel = new Set();
    run.text = '';
    run.checked = false;
    draw();
  }

  function toggle(origIdx) {
    const item = run.items[run.i];
    if (run.checked) return;
    if (item.type === 'multiple') {
      run.sel.has(origIdx) ? run.sel.delete(origIdx) : run.sel.add(origIdx);
    } else {
      run.sel = new Set([origIdx]);
    }
    draw();
  }

  function header() {
    return `<div class="breadcrumbs"><a href="#/">Предметы</a> / <a href="#/s/${esc(s.id)}">${esc(s.title)}</a> / Квиз</div>`;
  }

  function draw() {
    if (run.i >= run.items.length) return drawResults();
    const item = run.items[run.i];
    const last = run.checked ? run.results[run.results.length - 1] : null;

    let body;
    if (item.type === 'text') {
      body = `<input class="text-answer" id="text-answer" placeholder="Введите ответ и нажмите Enter" value="${esc(run.text)}" ${run.checked ? 'disabled' : ''} autocomplete="off">`;
    } else {
      body = `<div class="options">${item.order.map((orig, pos) => {
        let cls = '';
        if (run.checked) {
          if (item.correct.has(orig)) cls = 'correct';
          else if (run.sel.has(orig)) cls = 'wrong';
        } else if (run.sel.has(orig)) cls = 'selected';
        return `<button class="option ${cls}" type="button" data-opt="${orig}" ${run.checked ? 'disabled' : ''}><span class="key">${LETTERS[pos] || pos + 1}</span><span>${mdInline(item.options[orig])}</span></button>`;
      }).join('')}</div>`;
    }

    let feedback = '';
    if (last) {
      const correctText = item.type === 'text'
        ? esc([].concat(item.q.answer)[0])
        : [...item.correct].map((i) => mdInline(item.options[i])).join('; ');
      feedback = `<div class="feedback ${last.ok ? 'ok' : 'bad'}">
        <div class="verdict">${last.ok ? '✓ Верно' : '× Неверно'}</div>
        ${!last.ok ? `<p>Правильный ответ: ${correctText}</p>` : ''}
        ${item.q.explain ? md(item.q.explain) : ''}
      </div>`;
    }

    app.innerHTML = `
      ${header()}
      <div class="quiz-head">
        <h1 style="margin:0">${esc(quiz.title || meta.title)}</h1>
        <span class="mono small muted">${run.i + 1} / ${run.items.length}</span>
      </div>
      <div class="quiz-progress"><span style="width:${pct(run.i, run.items.length)}%"></span></div>
      <div class="sheet">
        <span class="label" style="display:block;margin-bottom:var(--s3)">Вопрос ${run.i + 1}${item.type === 'multiple' ? ' · несколько ответов' : ''}</span>
        <div class="question">${md(item.q.q)}</div>
        ${body}
        ${feedback}
        <div class="btn-row">
          ${run.checked
            ? `<button class="btn primary" type="button" id="next">${run.i + 1 < run.items.length ? 'Дальше →' : 'Результаты'}</button>`
            : `<button class="btn primary" type="button" id="check">Проверить</button>`}
        </div>
      </div>
      <p class="hint"><kbd>1</kbd>–<kbd>9</kbd> выбрать вариант · <kbd>Enter</kbd> проверить и дальше</p>
    `;

    app.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => toggle(Number(b.dataset.opt))));
    app.querySelector('#check')?.addEventListener('click', check);
    app.querySelector('#next')?.addEventListener('click', nextQ);
    const input = app.querySelector('#text-answer');
    if (input) {
      input.addEventListener('input', () => { run.text = input.value; });
      if (!run.checked) input.focus();
    }
    if (run.checked) app.querySelector('#next')?.focus();
  }

  function drawResults() {
    const ok = run.results.filter((r) => r.ok).length;
    const score = pct(ok, run.results.length);
    if (run.isFull) store.saveQuizResult(s.id, quizId, score);
    const best = store.quizResult(s.id, quizId)?.best;
    const wrong = run.results.filter((r) => !r.ok);

    const verdict = score === 100 ? 'Без ошибок.' : score >= 80 ? 'Хороший результат.' : score >= 50 ? 'Неплохо, но стоит повторить.' : 'Стоит вернуться к материалам.';
    app.innerHTML = `
      ${header()}
      <span class="label" style="display:block;margin-bottom:var(--s2)">${run.isFull ? 'Результат' : 'Работа над ошибками'}</span>
      <h1>${esc(quiz.title || meta.title)}</h1>
      <div class="sheet result" style="margin-top:var(--s5)">
        <div class="big">${score}<span class="unit">%</span></div>
        <div>
          <p style="margin-bottom:var(--s1)"><strong>${ok} из ${run.results.length}</strong> правильно. ${verdict}</p>
          ${run.isFull && best != null ? `<p class="small muted mono" style="margin:0">лучший результат: ${best}%</p>` : ''}
          <div class="btn-row" style="margin-top:var(--s4)">
            ${wrong.length ? `<button class="btn primary" type="button" id="mistakes">Повторить ошибки (${wrong.length})</button>` : ''}
            <button class="btn ${wrong.length ? '' : 'primary'}" type="button" id="again">Пройти заново</button>
            <a class="btn quiet" href="#/s/${esc(s.id)}">К предмету</a>
          </div>
        </div>
      </div>
      ${wrong.length ? `
        <section class="section">
          <div class="section-head"><h2>Разбор ошибок</h2><span class="aside mono">${wrong.length}</span></div>
          ${wrong.map(({ item, given }) => {
            const yours = item.type === 'text' ? esc(given) : given.map((i) => mdInline(item.options[i])).join('; ');
            const right = item.type === 'text' ? esc([].concat(item.q.answer)[0]) : [...item.correct].map((i) => mdInline(item.options[i])).join('; ');
            return `<div class="mistake">
              <div class="question">${md(item.q.q)}</div>
              <div class="answer-line"><span class="label" style="color:var(--bad)">Ваш ответ</span><span>${yours}</span></div>
              <div class="answer-line"><span class="label" style="color:var(--ok)">Верно</span><span>${right}</span></div>
              ${item.q.explain ? `<div class="small muted" style="margin-top:var(--s2)">${md(item.q.explain)}</div>` : ''}
            </div>`;
          }).join('')}
        </section>` : ''}
    `;
    app.querySelector('#again').addEventListener('click', () => start(all, true));
    app.querySelector('#mistakes')?.addEventListener('click', () => start(wrong.map((w) => w.item.q), false));
  }

  function onKey(e) {
    if (!run || run.i >= run.items.length) return;
    const item = run.items[run.i];
    if (e.key === 'Enter') {
      e.preventDefault();
      run.checked ? nextQ() : check();
      return;
    }
    if (item.type === 'text' || e.target.matches?.('input, textarea')) return;
    const n = Number(e.key);
    if (n >= 1 && n <= item.order.length) toggle(item.order[n - 1]);
  }

  document.addEventListener('keydown', onKey);
  start(all, true);
  return () => document.removeEventListener('keydown', onKey);
}
