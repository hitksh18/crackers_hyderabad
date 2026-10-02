import { auth } from '../firebase';

/**
 * Fetch wrapper that attaches the caller's Firebase ID token.
 *
 * The admin API verifies this token and resolves the caller's role server-side.
 * Client-side route guards decide what a user *sees*; this is what decides what
 * they can actually *do*.
 */
const API_BASE = (
  import.meta.env.VITE_BACKEND_API_URL || import.meta.env.VITE_API_URL || ''
).replace(/\/+$/, '');

export function apiUrl(path) {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  if (!API_BASE) return path;
  return `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function authFetch(url, options = {}) {
  const user = auth.currentUser;

  if (!user) {
    throw new Error('You need to be signed in to do that.');
  }

  const token = await user.getIdToken();

  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  const finalUrl = apiUrl(url);
  let res = await fetch(finalUrl, { ...options, headers });

  // If token is stale (e.g., just disabled/enabled), retry once with a forced refresh
  if (res.status === 401) {
    try {
      const freshToken = await user.getIdToken(true);
      const retryHeaders = new Headers(options.headers || {});
      retryHeaders.set('Authorization', `Bearer ${freshToken}`);
      const retryRes = await fetch(apiUrl(url), { ...options, headers: retryHeaders });
      // Only use retry if it succeeded or at least not 401 — otherwise surface original 401
      if (retryRes.status !== 401) return retryRes;
      // Both 401 — return retry (still 401) for consistent handling
      return retryRes;
    } catch {
      // Refresh failed — return original 401
      return res;
    }
  }

  return res;
}

/**
 * Turn a failed response into a message worth showing a person.
 * Server responses are already scrubbed of internals; this adds sensible
 * wording for the status codes the API actually returns.
 */
export async function readApiError(response, fallback = 'Something went wrong. Please try again.') {
  let serverMessage = '';

  try {
    const data = await response.json();
    serverMessage = data?.error || '';
  } catch {
    // Non-JSON body — fall through to the status-based wording.
  }

  if (response.status === 401) return 'Your session has expired. Please sign in again.';
  if (response.status === 403) return serverMessage || 'You do not have permission to do that.';
  if (response.status === 429) return 'Too many attempts. Please wait a moment and try again.';

  return serverMessage || fallback;
}
