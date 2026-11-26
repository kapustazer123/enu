// Схема D1. Выполняется при первом запросе к API (CREATE ... IF NOT EXISTS — повторно безопасно).
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    grp TEXT NOT NULL DEFAULT '',
    pass_hash TEXT NOT NULL,
    pass_salt TEXT NOT NULL,
    is_admin INTEGER NOT NULL DEFAULT 0,
    show_in_rating INTEGER NOT NULL DEFAULT 1,
    failed_logins INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)`,
  `CREATE TABLE IF NOT EXISTS progress (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS summary (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    readiness INTEGER NOT NULL DEFAULT 0,
    exam_best INTEGER,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, subject)
  )`,
  // Закрытые данные (ссылки на онлайн-занятия, код группы) — только в базе, не в репозитории
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS link_access (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    granted_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS code_attempts (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    n INTEGER NOT NULL DEFAULT 0
  )`,
];
