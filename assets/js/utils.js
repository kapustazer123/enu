// Общие утилиты: экранирование, markdown + формулы, даты.

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Вырезаем формулы ($...$, $$...$$) до markdown, чтобы marked их не портил,
// и возвращаем после санитизации уже отрендеренными через KaTeX.
const MATH_RE = /(```[\s\S]*?```|`[^`\n]*`)|(?<!\\)\$\$([\s\S]+?)\$\$|(?<!\\)\$([^$\n]+?)\$/g;

function renderMath(tex, display) {
  if (!window.katex) return esc(display ? `$$${tex}$$` : `$${tex}$`);
  try {
    return window.katex.renderToString(tex, { displayMode: display, throwOnError: false });
  } catch {
    return esc(tex);
  }
}

function withMath(text, parse) {
  const blocks = [];
  const protectedText = String(text ?? '').replace(MATH_RE, (m, code, block, inline) => {
    if (code) return code;
    const i = blocks.push(renderMath(block ?? inline, block != null)) - 1;
    return block != null ? `\n\nMATHPH${i}END\n\n` : `MATHPH${i}END`;
  }).replace(/\\\$/g, '$');
  const html = window.DOMPurify ? window.DOMPurify.sanitize(parse(protectedText)) : esc(protectedText);
  return html
    .replace(/<p>MATHPH(\d+)END<\/p>/g, (_, i) => blocks[i])
    .replace(/MATHPH(\d+)END/g, (_, i) => blocks[i]);
}

/** Markdown-блок (абзацы, списки, таблицы) с формулами. */
export function md(text) {
  if (!window.marked) return `<p>${esc(text)}</p>`;
  return withMath(text, (t) => window.marked.parse(t));
}

/** Однострочный markdown (для вариантов ответа). */
export function mdInline(text) {
  if (!window.marked) return esc(text);
  return withMath(text, (t) => window.marked.parseInline(t));
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pct(part, total) {
  return total ? Math.round((part / total) * 100) : 0;
}

export function progressBar(value, label = '') {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return `<div class="progress-row"><div class="progress" role="progressbar" aria-valuenow="${v}" aria-valuemin="0" aria-valuemax="100"><span style="width:${v}%"></span></div><span>${label || v + '%'}</span></div>`;
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

export function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

export function formatDate(s, withTime = true) {
  const d = parseDate(s);
  if (!d) return 'дата не указана';
  let out = `${d.getDate()} ${MONTHS[d.getMonth()]}, ${WEEKDAYS[d.getDay()]}`;
  if (withTime && /T\d/.test(s)) out += `, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return out;
}

export function daysUntil(s) {
  const d = parseDate(s);
  if (!d) return null;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  return Math.round((target - start) / 86400000);
}

export function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

export function daysLabel(days) {
  if (days == null) return '';
  if (days < 0) return 'прошёл';
  if (days === 0) return 'сегодня';
  if (days === 1) return 'завтра';
  return `через ${days} ${plural(days, 'день', 'дня', 'дней')}`;
}

export function daysBadge(days) {
  if (days == null) return '<span class="tag">без даты</span>';
  const cls = days < 0 ? '' : days <= 3 ? 'bad' : days <= 10 ? 'warn' : '';
  return `<span class="tag ${cls}">${daysLabel(days)}</span>`;
}

/** Короткое число дней для таблиц: «50 дн.», «завтра», «сдан». */
export function daysShort(days) {
  if (days == null) return '—';
  if (days < 0) return 'прошёл';
  if (days === 0) return '<span class="hl">сегодня</span>';
  if (days === 1) return '<span class="hl">завтра</span>';
  return `${days} ${plural(days, 'день', 'дня', 'дней')}`;
}

export const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И'];

export function normalizeAnswer(s) {
  return String(s ?? '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').replace(/,/g, '.');
}
