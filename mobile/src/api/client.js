import { assertApiConfig } from '../config/env';
import { getAuthToken, clearAuthToken } from '../storage/authStorage';
import { shouldClearAuthTokenOnError } from './authSessionPolicy.mjs';

const DEFAULT_TIMEOUT_MS = 15000;

export class ApiClientError extends Error {
  constructor(
    message,
    { status = 0, errors = [], data = null, code = null, isNetworkError = false, isTimeout = false, shouldClearAuth = false } = {}
  ) {
    super(message || 'Request failed');
    this.name = 'ApiClientError';
    this.status = status;
    this.errors = Array.isArray(errors) ? errors : [];
    this.data = data;
    this.code = code;
    this.isNetworkError = isNetworkError;
    this.isTimeout = isTimeout;
    this.shouldClearAuth = Boolean(shouldClearAuth);
  }
}

export { shouldClearAuthTokenOnError };

function buildUrl(path) {
  const baseUrl = assertApiConfig();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${baseUrl}${normalizedPath}`;
}

async function parseResponseBody(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }
  try {
    const text = await response.text();
    return text ? { message: text } : null;
  } catch {
    return null;
  }
}

function normalizeErrorMessage(body, fallback) {
  if (body && typeof body.message === 'string' && body.message.trim()) return body.message;
  return fallback;
}

async function request(path, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    auth = false,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const url = buildUrl(path);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const requestHeaders = {
      Accept: 'application/json',
      ...headers,
    };

    if (body !== undefined) {
      requestHeaders['Content-Type'] = requestHeaders['Content-Type'] || 'application/json';
    }

    if (auth) {
      let token = null;
      try {
        token = await getAuthToken();
      } catch (storageError) {
        throw new ApiClientError('Unable to access the stored authentication session. Please sign in again.', {
          code: 'AUTH_STORAGE_READ_ERROR',
          shouldClearAuth: false,
        });
      }
      if (token) {
        requestHeaders.Authorization = `Bearer ${token}`;
      }
    }

    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const responseBody = await parseResponseBody(response);

    if (!response.ok) {
      const shouldClearAuth = shouldClearAuthTokenOnError({
        auth,
        status: response.status,
        responseBody,
      });

      if (shouldClearAuth) {
        try {
          await clearAuthToken();
        } catch {
          // Token storage clear failed; still surface the original API/auth error.
        }
      }

      throw new ApiClientError(normalizeErrorMessage(responseBody, `Request failed with status ${response.status}`), {
        status: response.status,
        errors: responseBody && Array.isArray(responseBody.errors) ? responseBody.errors : [],
        data: responseBody,
        code: responseBody && responseBody.code,
        shouldClearAuth,
      });
    }

    return responseBody;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;

    if (error && error.name === 'AbortError') {
      throw new ApiClientError('Request timed out. Please check your connection and try again.', {
        isTimeout: true,
        code: 'TIMEOUT',
      });
    }

    // Fetch/network failures (offline, unreachable host, DNS, etc.)
    throw new ApiClientError('Unable to reach the server. Please check your internet/LAN connection and API URL.', {
      isNetworkError: true,
      code: 'NETWORK_ERROR',
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export const apiClient = {
  request,
  get: (path, options = {}) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options = {}) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options = {}) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options = {}) => request(path, { ...options, method: 'DELETE' }),
};

export default apiClient;
