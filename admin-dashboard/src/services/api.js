export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const TOKEN_KEY = 'mess_hunt_admin_token';
const USER_KEY = 'mess_hunt_admin_user';

export function getStoredToken() { return localStorage.getItem(TOKEN_KEY); }
export function getStoredUser() { try { const raw = localStorage.getItem(USER_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }
export function setAuthSession(token, user) { if (token) localStorage.setItem(TOKEN_KEY, token); if (user) localStorage.setItem(USER_KEY, JSON.stringify(user)); }
export function clearAuthSession() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }

export async function apiRequest(path, options = {}) {
  const { method = 'GET', body, auth = false, headers = {} } = options;
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
  const reqHeaders = { Accept: 'application/json', ...headers };
  if (body !== undefined) reqHeaders['Content-Type'] = reqHeaders['Content-Type'] || 'application/json';
  if (auth) { const token = getStoredToken(); if (token) reqHeaders.Authorization = `Bearer ${token}`; }
  const res = await fetch(url, { method, headers: reqHeaders, body: body === undefined ? undefined : JSON.stringify(body) });
  const ct = res.headers.get('content-type') || '';
  let payload = null;
  if (ct.includes('application/json')) { try { payload = await res.json(); } catch { payload = null; } }
  else { try { const t = await res.text(); payload = t ? { message: t } : null; } catch { payload = null; } }
  if (!res.ok) {
    const err = new Error(payload?.message || `Request failed with status ${res.status}`);
    err.status = res.status; err.errors = payload?.errors || []; err.data = payload;
    throw err;
  }
  return payload;
}

export async function adminLogin(email, password) {
  const res = await apiRequest('/auth/admin/login', { method: 'POST', body: { email, password } });
  const { token, user } = res.data || {};
  if (token && user) setAuthSession(token, user);
  return user;
}
export async function getMe() { const res = await apiRequest('/auth/me', { auth: true }); return res.data?.user || null; }
export async function logoutApi() { try { await apiRequest('/auth/logout', { method: 'POST', auth: true }); } catch {} clearAuthSession(); }

export async function getDashboardStats() { return (await apiRequest('/admin/dashboard/stats', { auth: true })).data?.stats; }
export async function listStudents(params = {}) { const qs = new URLSearchParams(Object.entries(params).filter(([,v])=>v!==undefined&&v!=='')).toString(); return (await apiRequest(`/admin/students${qs?`?${qs}`:''}`, { auth: true })).data; }
export async function updateStudentStatus(id, isActive) { return apiRequest(`/admin/students/${id}/status`, { method: 'PATCH', body: { isActive }, auth: true }); }
export async function listOwners(params = {}) { const qs = new URLSearchParams(Object.entries(params).filter(([,v])=>v!==undefined&&v!=='')).toString(); return (await apiRequest(`/admin/owners${qs?`?${qs}`:''}`, { auth: true })).data; }
export async function updateOwnerVerification(id, isVerified) { return apiRequest(`/admin/owners/${id}/verification`, { method: 'PATCH', body: { isVerified }, auth: true }); }
export async function updateOwnerStatus(id, isActive) { return apiRequest(`/admin/owners/${id}/status`, { method: 'PATCH', body: { isActive }, auth: true }); }
export async function listAccommodations(params = {}) { const qs = new URLSearchParams(Object.entries(params).filter(([,v])=>v!==undefined&&v!=='')).toString(); return (await apiRequest(`/admin/accommodations${qs?`?${qs}`:''}`, { auth: true })).data; }
export async function decideAccommodation(id, decision, rejectionReason) { return apiRequest(`/admin/accommodations/${id}/decision`, { method: 'PATCH', body: rejectionReason ? { decision, rejectionReason } : { decision }, auth: true }); }
export async function listReviews(params = {}) { const qs = new URLSearchParams(Object.entries(params).filter(([,v])=>v!==undefined&&v!=='')).toString(); return (await apiRequest(`/admin/reviews${qs?`?${qs}`:''}`, { auth: true })).data; }
export async function moderateReview(id, action, moderationNote) { return apiRequest(`/admin/reviews/${id}/moderation`, { method: 'PATCH', body: moderationNote ? { action, moderationNote } : { action }, auth: true }); }
export async function updateReportHandlingStatus(reviewId, reportIndex, status, handlingNote) { return apiRequest(`/admin/reviews/${reviewId}/reports/${reportIndex}`, { method: 'PATCH', body: handlingNote ? { status, handlingNote } : { status }, auth: true }); }
