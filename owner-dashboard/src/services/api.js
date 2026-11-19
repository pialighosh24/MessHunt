export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const TOKEN_KEY = 'mess_hunt_owner_token';
const USER_KEY = 'mess_hunt_owner_user';

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setAuthSession(token, user) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function normalizeError(body, status) {
  if (body && typeof body.message === 'string') return body.message;
  return `Request failed with status ${status}`;
}

export async function apiRequest(path, options = {}) {
  const { method = 'GET', body, auth = false, headers = {} } = options;
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const reqHeaders = { Accept: 'application/json', ...headers };

  if (body !== undefined && !(body instanceof FormData)) {
    reqHeaders['Content-Type'] = reqHeaders['Content-Type'] || 'application/json';
  }

  if (auth) {
    const token = getStoredToken();
    if (token) reqHeaders.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body === undefined ? undefined : (body instanceof FormData ? body : JSON.stringify(body)),
  });

  const contentType = res.headers.get('content-type') || '';
  let payload = null;
  if (contentType.includes('application/json')) {
    try { payload = await res.json(); } catch { payload = null; }
  } else {
    try { const t = await res.text(); payload = t ? { message: t } : null; } catch { payload = null; }
  }

  if (!res.ok) {
    const err = new Error(normalizeError(payload, res.status));
    err.status = res.status;
    err.errors = payload?.errors || [];
    err.data = payload;
    if (auth && res.status === 401) {
      // don't auto-clear here blindly except caller can decide; keep simple
    }
    throw err;
  }

  return payload;
}

export async function ownerLogin(email, password) {
  const res = await apiRequest('/auth/owner/login', { method: 'POST', body: { email, password } });
  const { token, user } = res.data || {};
  if (token && user) setAuthSession(token, user);
  return user;
}

export async function ownerRegister(payload) {
  const res = await apiRequest('/auth/owner/register', { method: 'POST', body: payload });
  const { token, user } = res.data || {};
  if (token && user) setAuthSession(token, user);
  return user;
}

export async function getMe() {
  const res = await apiRequest('/auth/me', { auth: true });
  return res.data?.user || null;
}

export async function logoutApi() {
  try { await apiRequest('/auth/logout', { method: 'POST', auth: true }); } catch {}
  clearAuthSession();
}

export async function getMyAccommodations() {
  const res = await apiRequest('/owners/accommodations', { auth: true });
  return res.data?.accommodations || [];
}

export async function getMyAccommodation(id) {
  const res = await apiRequest(`/owners/accommodations/${id}`, { auth: true });
  return res.data?.accommodation || null;
}

export async function createAccommodation(payload) {
  const res = await apiRequest('/owners/accommodations', { method: 'POST', body: payload, auth: true });
  return res.data?.accommodation || null;
}

export async function updateAccommodation(id, payload) {
  const res = await apiRequest(`/owners/accommodations/${id}`, { method: 'PATCH', body: payload, auth: true });
  return res.data || null;
}

export async function deleteAccommodation(id) {
  return apiRequest(`/owners/accommodations/${id}`, { method: 'DELETE', auth: true });
}

export async function uploadPhotos(id, files) {
  const fd = new FormData();
  Array.from(files || []).forEach((f) => fd.append('photos', f));
  const res = await apiRequest(`/owners/accommodations/${id}/photos`, { method: 'POST', body: fd, auth: true });
  return res.data || null;
}

export async function deletePhoto(id, photoId) {
  return apiRequest(`/owners/accommodations/${id}/photos/${encodeURIComponent(photoId)}`, { method: 'DELETE', auth: true });
}
