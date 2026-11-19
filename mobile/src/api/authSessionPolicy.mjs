export function shouldClearAuthTokenOnError({ auth = false, status = 0, responseBody = null } = {}) {
  if (!auth) return false;

  // 401 from protected endpoints indicates invalid/expired/missing token or unavailable account session.
  if (status === 401) return true;

  // 403 must not always clear auth: authenticated users can be forbidden for permission/role reasons.
  // Clear only for session-invalidating cases such as inactive accounts.
  if (status === 403) {
    const message = responseBody && typeof responseBody.message === 'string' ? responseBody.message : '';
    return /account is inactive|inactive account|token has expired|invalid authentication token|authentication failed/i.test(
      message
    );
  }

  return false;
}

export default {
  shouldClearAuthTokenOnError,
};
