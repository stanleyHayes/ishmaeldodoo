type AuthState = Readonly<{ accessToken: string; csrfToken: string }>;

let state: AuthState | null = null;

export function getAuthState(): AuthState | null {
  return state;
}

export function setAuthState(next: AuthState): void {
  state = next;
}

export function clearAuthState(): void {
  state = null;
}
