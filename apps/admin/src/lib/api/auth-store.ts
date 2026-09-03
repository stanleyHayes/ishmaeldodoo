type AuthState = Readonly<{ accessToken: string; csrfToken: string }>;

/**
 * The access token stays in memory and is never persisted: it is a bearer
 * credential, and a reload should cost nothing worse than one refresh call.
 *
 * The CSRF token is persisted, because it is not a credential. It is the
 * readable half of a double-submit pair whose other half is the `SameSite=Strict`,
 * `HttpOnly` refresh cookie, and it is useless without that cookie. Keeping it
 * lets a cold page load prove the refresh request came from this application
 * rather than another site, which is the only thing it was ever for.
 */
const CSRF_STORAGE_KEY = "amanor.admin.csrf";

let state: AuthState | null = null;

export function getAuthState(): AuthState | null {
  return state;
}

export function setAuthState(next: AuthState): void {
  state = next;
  rememberCsrfToken(next.csrfToken);
}

export function clearAuthState(): void {
  state = null;
  forgetCsrfToken();
}

function rememberCsrfToken(csrfToken: string): void {
  try {
    window.localStorage?.setItem(CSRF_STORAGE_KEY, csrfToken);
  } catch {
    // Private browsing and blocked storage are survivable: the operator signs
    // in again after a reload rather than losing the session outright.
  }
}

export function storedCsrfToken(): string | null {
  try {
    return window.localStorage?.getItem(CSRF_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

function forgetCsrfToken(): void {
  try {
    window.localStorage?.removeItem(CSRF_STORAGE_KEY);
  } catch {
    // Nothing to do: the token is inert without the refresh cookie.
  }
}
