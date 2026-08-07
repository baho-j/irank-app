/**
 * When a restored session may be acted on.
 *
 * A token read from localStorage has not been checked by the server. It may
 * name a session that expired, was revoked, or belonged to a deployment whose
 * data has since been wiped. Treating it as signed in fires authenticated
 * requests that the server rejects, and the first thing to notice is whichever
 * feature hook happened to run — not the auth layer.
 */
export type SessionState = {
  token: string | null;
  user: unknown | null;
  /** True once the server has answered for this token, or none was restored. */
  sessionChecked: boolean;
  /** True while an explicit sign-in or sign-up is in flight. */
  busy: boolean;
  /** False until the client has hydrated and can read localStorage. */
  hydrated: boolean;
};

export function isAuthenticated(state: SessionState): boolean {
  return !!state.token && !!state.user && state.sessionChecked;
}

export function isLoading(state: SessionState): boolean {
  return state.busy || !state.hydrated || !state.sessionChecked;
}
