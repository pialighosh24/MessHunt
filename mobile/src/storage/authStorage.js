import * as SecureStore from 'expo-secure-store';

const TOKEN_KEY = 'mess_hunt_auth_token';

export async function saveAuthToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('A valid authentication token is required.');
  }
  try {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  } catch (error) {
    const err = new Error('Failed to securely store the authentication token.');
    err.cause = error;
    throw err;
  }
}

export async function getAuthToken() {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (error) {
    const err = new Error('Failed to read the stored authentication token.');
    err.cause = error;
    throw err;
  }
}

export async function clearAuthToken() {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (error) {
    const err = new Error('Failed to clear the stored authentication token.');
    err.cause = error;
    throw err;
  }
}

export default {
  saveAuthToken,
  getAuthToken,
  clearAuthToken,
};
