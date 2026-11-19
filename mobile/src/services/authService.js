import apiClient from '../api/client';
import { saveAuthToken, clearAuthToken, getAuthToken } from '../storage/authStorage';

// Backend auth endpoints (student + shared)
// Responses:
// - register/login: { success, message, data: { token, user } }
// - /me: { success, message, data: { user } }
// - /logout: { success, message, data: { authType, tokenRevoked } }

function extractAuthResult(response) {
  const data = response && response.data ? response.data : {};
  return {
    token: data.token,
    user: data.user,
    message: response && response.message,
  };
}

export async function registerStudent(payload) {
  const response = await apiClient.post('/auth/student/register', payload);
  const { token, user, message } = extractAuthResult(response);
  if (!token || !user) {
    throw new Error('Registration succeeded but authentication data was missing from the server response.');
  }
  await saveAuthToken(token);
  return { user, token, message };
}

export async function loginStudent(payload) {
  const response = await apiClient.post('/auth/student/login', payload);
  const { token, user, message } = extractAuthResult(response);
  if (!token || !user) {
    throw new Error('Login succeeded but authentication data was missing from the server response.');
  }
  await saveAuthToken(token);
  return { user, token, message };
}

export async function getCurrentStudent() {
  const response = await apiClient.get('/auth/me', { auth: true });
  const user = response && response.data ? response.data.user : null;
  if (!user) {
    throw new Error('Failed to load the authenticated account.');
  }
  return user;
}

export async function logoutStudent() {
  let token = null;
  try {
    token = await getAuthToken();
  } catch {
    token = null;
  }

  let apiError = null;
  try {
    if (token) {
      // Backend logout is authenticated and stateless (JWT not revoked server-side).
      await apiClient.post('/auth/logout', undefined, { auth: true });
    }
  } catch (error) {
    apiError = error;
  }

  try {
    await clearAuthToken();
  } catch (clearError) {
    // Reliable local credential clearing is required; surface storage failure.
    throw clearError;
  }

  // If server logout call failed (network/timeout/etc.), local credentials are already cleared.
  // Return success for local logout completion; caller may inspect/log apiError if needed.
  return { success: true, serverLogoutError: apiError || null };
}

export async function restoreSession() {
  let token = null;
  try {
    token = await getAuthToken();
  } catch (error) {
    // Cannot read secure storage; treat as no restorable session rather than crashing the app.
    return null;
  }

  if (!token) return null;

  try {
    const user = await getCurrentStudent();
    return user;
  } catch (error) {
    // Only clear session for confirmed invalid/expired/inactive auth states.
    if (error && error.shouldClearAuth) {
      try {
        await clearAuthToken();
      } catch {
        // If storage clear fails, still end local session state in UI.
      }
      return null;
    }

    // Do not clear session for permission-only 403, network failures, timeouts, or config/transient issues.
    throw error;
  }
}

export default {
  registerStudent,
  loginStudent,
  getCurrentStudent,
  logoutStudent,
  restoreSession,
};
