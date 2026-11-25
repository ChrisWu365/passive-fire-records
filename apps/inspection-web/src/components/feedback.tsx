import type { ReactNode } from 'react';
import { ApiError } from '../api/api-error';

/** The text to show for a caught value: the server's or client's own message, or the given fallback. */
export function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** The per-field messages of a validation error; empty for every other kind of failure. */
export function fieldMessagesOf(error: unknown): Readonly<Record<string, string>> {
  return error instanceof ApiError ? error.fields : {};
}

/** An error the user must notice. Screen readers announce it at once. Renders nothing when there is none. */
export function ErrorAlert({ message, children }: { message: string; children?: ReactNode }) {
  if (!message) return null;
  return <div className="alert error" role="alert">{message}{children}</div>;
}

/** A confirmation such as "Saved". Announced politely. Renders nothing when there is none. */
export function StatusMessage({ message }: { message: string }) {
  if (!message) return null;
  return <div className="alert success" role="status">{message}</div>;
}
