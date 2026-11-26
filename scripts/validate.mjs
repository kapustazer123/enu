#!/usr/bin/env node
// Проверка контента: все ли файлы на месте, валиден ли JSON, корректны ли ответы в квизах.
// Запуск: node scripts/validate.mjs

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../content/', import.meta.url).pathname;
const errors = [];
const warnings = [];
let stats = { subjects: 0, topics: 0, quizzes: 0, questions: 0, cards: 0, examQuestions: 0 };

function readJSON(path) {
  if (!existsSync(path)) { errors.push(`Файл не найден: ${path}`); return null; }
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { errors.push(`Невалидный JSON в ${path}: ${e.message}`); return null; }
}

function uniqueIds(list, where) {
  const seen = new Set();
  for (const x of list) {
    if (!x.id) errors.push(`${where}: элемент без id (${JSON.stringify(x).slice(0, 60)})`);
    else if (seen.has(x.id)) errors.push(`${where}: повторяющийся id «${x.id}»`);
    else if (!/^[\w-]+$/.test(x.id)) errors.push(`${where}: id «${x.id}» — только латиница, цифры, - и _`);
    seen.add(x.id);
  }
}

function checkQuiz(quiz, where) {
  if (!Array.isArray(quiz.questions) || !quiz.questions.length) { errors.push(`${where}: нет вопросов`); return; }
  quiz.questions.forEach((q, i) => {
    const w = `${where}, вопрос ${i + 1}`;
    stats.questions++;
    if (!q.q) errors.push(`${w}: нет текста вопроса (поле "q")`);
    const type = q.type || (typeof q.answer === 'boolean' ? 'truefalse' : Array.isArray(q.answer) && q.options ? 'multiple' : q.options ? 'single' : 'text');
    if (q.answer === undefined) errors.push(`${w}: нет ответа (поле "answer")`);
    if (type === 'single' || type === 'multiple') {
      if (!Array.isArray(q.options) || q.options.length < 2) errors.push(`${w}: нужно минимум 2 варианта в "options"`);
      const ans = [].concat(q.answer);
      for (const a of ans) {
        if (!Number.isInteger(a) || a < 0 || a >= (q.options?.length ?? 0)) errors.push(`${w}: ответ ${a} — нет такого варианта (нумерация с 0)`);
      }
      if (type === 'single' && ans.length !== 1) errors.push(`${w}: у type "single" должен быть ровно один ответ`);
    } else if (type === 'truefalse') {
      if (typeof q.answer !== 'boolean') errors.push(`${w}: у type "truefalse" ответ должен быть true или false`);
    } else if (type === 'text') {
      if (![].concat(q.answer).every((a) => typeof a === 'string' || typeof a === 'number')) errors.push(`${w}: у type "text" ответ — строка или массив строк`);
    } else {
      errors.push(`${w}: неизвестный type «${type}»`);
    }
  });
}

const portal = readJSON(join(root, 'subjects.json'));
if (portal) {
  if (!Array.isArray(portal.subjects)) errors.push('subjects.json: поле "subjects" должно быть массивом');
  for (const id of portal.subjects || []) {
    const dir = join(root, id);
    const s = readJSON(join(dir, 'subject.json'));
    if (!s) continue;
    stats.subjects++;
    const where = `content/${id}`;
    if (!s.title) errors.push(`${where}/subject.json: нет title`);
    if (s.exam?.date && isNaN(new Date(s.exam.date))) errors.push(`${where}: неверная дата экзамена «${s.exam.date}» (формат 2027-01-15T09:00)`);
    if (!s.exam?.date) warnings.push(`${where}: не указана дата экзамена`);

    uniqueIds(s.topics || [], `${where} topics`);
    for (const t of s.topics || []) {
      stats.topics++;
      if (!existsSync(join(dir, t.file || ''))) errors.push(`${where}: файл темы не найден — ${t.file}`);
    }

    uniqueIds(s.quizzes || [], `${where} quizzes`);
    const topicIds = new Set((s.topics || []).map((t) => t.id));
    for (const q of s.quizzes || []) {
      stats.quizzes++;
      if (q.topic && !topicIds.has(q.topic)) warnings.push(`${where}: квиз «${q.id}» ссылается на несуществующую тему «${q.topic}»`);
      const quiz = readJSON(join(dir, q.file || ''));
      if (quiz) checkQuiz(quiz, `${where}/${q.file}`);
    }

    if (s.flashcards) {
      const cards = readJSON(join(dir, s.flashcards));
      const list = Array.isArray(cards) ? cards : cards?.cards || [];
      list.forEach((c, i) => {
        stats.cards++;
        if (!c.front || !c.back) errors.push(`${where}/${s.flashcards}: карточка ${i + 1} без front/back`);
      });
    }
    if (s.questions) {
      const qs = readJSON(join(dir, s.questions));
      const list = Array.isArray(qs) ? qs : qs?.questions || [];
      list.forEach((q, i) => {
        stats.examQuestions++;
        if (!q.q) errors.push(`${where}/${s.questions}: вопрос ${i + 1} без текста "q"`);
        if (q.topic && !topicIds.has(q.topic)) warnings.push(`${where}/${s.questions}: вопрос ${i + 1} ссылается на несуществующую тему «${q.topic}»`);
      });
    }
  }
}

// Расписание занятий (необязательный файл)
const ttPath = join(root, 'timetable.json');
if (existsSync(ttPath)) {
  const tt = readJSON(ttPath);
  const subjectIds = new Set(portal?.subjects || []);
  const DAYS = { пн: 1, вт: 2, ср: 3, чт: 4, пт: 5, сб: 6, вс: 7 };
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (tt) {
    for (const k of ['semesterStart', 'semesterEnd']) {
      if (tt[k] && isNaN(new Date(tt[k]))) errors.push(`timetable.json: неверная дата ${k} «${tt[k]}» (формат 2026-09-01)`);
    }
    if (!tt.semesterStart) warnings.push('timetable.json: не указан semesterStart — числитель/знаменатель не определятся');
    (tt.lessons || []).forEach((l, i) => {
      const w = `timetable.json, занятие ${i + 1}`;
      stats.lessons = (stats.lessons || 0) + 1;
      const day = typeof l.day === 'number' ? l.day : DAYS[String(l.day ?? '').toLowerCase().slice(0, 2)];
      if (!(day >= 1 && day <= 7)) errors.push(`${w}: неверный day «${l.day}» (1–7 или пн, вт, …)`);
      if (!time.test(l.start || '') || !time.test(l.end || '')) errors.push(`${w}: start/end в формате ЧЧ:ММ, например "08:00"`);
      else if (l.start >= l.end) errors.push(`${w}: start позже end`);
      if (!l.subject && !l.title) errors.push(`${w}: нужен subject (id предмета) или title`);
      if (l.subject && !subjectIds.has(l.subject)) warnings.push(`${w}: предмет «${l.subject}» не найден в subjects.json — укажите title или добавьте предмет`);
      if (l.week && !['числитель', 'знаменатель'].includes(String(l.week).toLowerCase())) errors.push(`${w}: week — "числитель" или "знаменатель"`);
    });
  }
}

for (const w of warnings) console.log(`⚠️  ${w}`);
for (const e of errors) console.log(`❌ ${e}`);
console.log(`\nПредметов: ${stats.subjects}, тем: ${stats.topics}, квизов: ${stats.quizzes} (вопросов: ${stats.questions}), карточек: ${stats.cards}, экзаменационных вопросов: ${stats.examQuestions}, занятий в расписании: ${stats.lessons || 0}`);
if (errors.length) {
  console.log(`\nНайдено ошибок: ${errors.length}`);
  process.exit(1);
}
console.log('✅ Контент в порядке');
