// Текущий пользователь и вход/выход. Без сервера (например, локальный python http.server) — гостевой режим.

import { api } from './api.js';
import { attachUser, detachUser } from './store.js';

let current = null;
let available = true; // есть ли API аккаунтов
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn(current));

export const auth = {
  get user() { return current; },
  get available() { return available; },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  async init() {
    try {
      const { user } = await api.get('/api/me');
      current = user;
      if (user) await attachUser(user);
    } catch (e) {
      available = e.status !== 404 && e.status !== 501 && e.status !== 503;
      current = null;
    }
    emit();
  },

  async login(username, password) {
    const { user } = await api.post('/api/login', { username, password });
    current = user;
    await attachUser(user, { importGuest: true });
    emit();
  },

  async register(data) {
    const { user } = await api.post('/api/register', data);
    current = user;
    await attachUser(user, { importGuest: true });
    emit();
  },

  async logout() {
    try { await api.post('/api/logout'); } catch { /* всё равно выходим локально */ }
    current = null;
    detachUser();
    emit();
  },

  async update(data) {
    const { user } = await api.patch('/api/me', data);
    current = user;
    emit();
  },
};
