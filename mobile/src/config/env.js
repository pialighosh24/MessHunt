// Expo public environment variables (available at runtime when prefixed with EXPO_PUBLIC_)
// Do not put secrets in EXPO_PUBLIC_* variables.

const RAW_API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || '').trim();

function isValidHttpUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function looksLikePlaceholder(value) {
  const v = String(value || '').toLowerCase();
  return (
    v.includes('192.168.x.x') ||
    v.includes('x.x.x.x') ||
    v.includes('your_lan_ip') ||
    v.includes('your-lan-ip') ||
    v.includes('<') ||
    v.includes('example.com') && v.includes('placeholder')
  );
}

function normalizeBaseUrl(value) {
  if (!value) return '';
  return value.replace(/\/+$/, '');
}

export const env = {
  apiBaseUrl: normalizeBaseUrl(RAW_API_BASE_URL),
  appName: process.env.EXPO_PUBLIC_APP_NAME || 'Mess Hunt',
  appTagline: process.env.EXPO_PUBLIC_APP_TAGLINE || 'Find Your Perfect Mess',
};

export function getApiConfigError() {
  if (!RAW_API_BASE_URL) {
    return 'EXPO_PUBLIC_API_BASE_URL is not set. Create mobile/.env from .env.example and set your backend API base URL (e.g. http://<your-lan-ip>:5000/api for Expo Go on a physical device).';
  }
  if (!isValidHttpUrl(RAW_API_BASE_URL)) {
    return 'EXPO_PUBLIC_API_BASE_URL must be a valid absolute http:// or https:// URL (e.g. http://192.168.1.10:5000/api).';
  }
  if (looksLikePlaceholder(RAW_API_BASE_URL)) {
    return 'EXPO_PUBLIC_API_BASE_URL still contains a placeholder value. Replace it with your development computer\'s actual LAN IPv4 address and backend port (e.g. http://192.168.1.10:5000/api), then restart Expo with cache cleared.';
  }
  return null;
}

export function assertApiConfig() {
  const error = getApiConfigError();
  if (error) {
    const err = new Error(error);
    err.code = 'API_CONFIG_ERROR';
    throw err;
  }
  return env.apiBaseUrl;
}

export default env;
