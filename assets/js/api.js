// Обёртка над API воркера (/api/*). Cookie сессии — httpOnly, JS её не видит.

async function request(method, path, data) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: { 'x-requested-with': 'prep-portal', ...(data !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: data !== undefined ? JSON.stringify(data) : undefined,
    });
  } catch {
    const e = new Error('Нет связи с сервером'); e.status = 0; throw e;
  }
  let payload = null;
  try { payload = await res.json(); } catch { /* не JSON — например, локальный сервер без API */ }
  if (!res.ok || !payload) {
    const e = new Error(payload?.error || (res.status === 404 || res.status === 501 ? 'Сервер аккаунтов недоступен' : `Ошибка ${res.status}`));
    e.status = res.status; throw e;
  }
  return payload;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, data = {}) => request('POST', path, data),
  patch: (path, data = {}) => request('PATCH', path, data),
  put: (path, data = {}) => request('PUT', path, data),
};
