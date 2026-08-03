const BASE_URL = import.meta.env.VITE_API_URL || '';

let _token = null;

export function setToken(token) {
  _token = token;
}

export async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (_token) {
    headers['Authorization'] = `Bearer ${_token}`;
  }

  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;
  return fetch(fullUrl, { ...options, headers });
}
