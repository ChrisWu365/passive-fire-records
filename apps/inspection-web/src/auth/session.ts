import type { Session, User } from '../api/types';

const TOKEN_KEY = 'inspection-token';
const USER_KEY = 'inspection-user';
const ROLES = ['ADMIN', 'INSPECTOR', 'VIEWER'];

/** The stored sign-in token, or null when nobody is signed in. */
export function readToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * The signed-in user as stored by the last sign-in, or null. Stored data that is missing, unreadable or not
 * shaped like a user counts as "not signed in", so a damaged entry can never break the app at start-up.
 */
export function readUser(): User | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw || !readToken()) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isUser(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function isUser(value: unknown): value is User {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string'
    && typeof candidate.email === 'string'
    && typeof candidate.name === 'string'
    && typeof candidate.role === 'string'
    && ROLES.includes(candidate.role);
}
