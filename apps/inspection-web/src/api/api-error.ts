/**
 * A request the server answered with an error status, or that never got an answer.
 * `message` is ready to show to the user.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    /** HTTP status, or 0 when the server could not be reached. */
    readonly status: number,
    /** One message per invalid field, for validation errors; empty otherwise. */
    readonly fields: Readonly<Record<string, string>> = {}
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
