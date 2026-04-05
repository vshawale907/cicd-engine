/**
 * api.js — fetch wrapper that automatically adds the Authorization header.
 *
 * Usage:
 *   import { apiFetch } from '../utils/api'
 *   const data = await apiFetch('/api/pipelines')
 *   await apiFetch('/api/pipelines/1/trigger', { method: 'POST' })
 */

let _token = null;

/** Called by AuthContext to keep the token in sync. */
export function setToken(token) {
  _token = token;
}

/**
 * A drop-in replacement for fetch() that injects the Bearer token.
 * @param {string} url
 * @param {RequestInit} [options]
 * @returns {Promise<Response>}
 */
export async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };

  if (_token) {
    headers['Authorization'] = `Bearer ${_token}`;
  }

  // Default Content-Type for JSON bodies
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  return fetch(url, { ...options, headers });
}
