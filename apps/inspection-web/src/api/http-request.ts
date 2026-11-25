import { ApiError } from './api-error';

export interface HttpRequestOptions {
  /** Origin the API paths are appended to. Empty means the page's own origin, which is the normal case. */
  baseUrl: string;
  /** Returns the current sign-in token, or null when nobody is signed in. */
  getToken: () => string | null;
  /** Defaults to the browser's fetch; tests pass their own. */
  fetch?: typeof fetch;
}

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RequestOptions {
  /** Sent as JSON, or as multipart form data when it is a FormData. */
  body?: unknown;
  /** False for sign-in, which must not carry a previous session's token. */
  authenticated?: boolean;
}

/** Sends one request and resolves with its JSON body. Rejects with ApiError on any failure. */
export type Requester = <T>(method: Method, path: string, options?: RequestOptions) => Promise<T>;

const UNREACHABLE = 'The server could not be reached. Check your connection and try again.';
const NO_CONTENT = 204;
const NETWORK_FAILURE_STATUS = 0;

/** Builds the function every HTTP client in the app sends its requests through. */
export function createRequester(options: HttpRequestOptions): Requester {
  // Looked up on each call, so a test or a polyfill installed after start-up is still honoured.
  const send: typeof fetch = options.fetch ?? ((input, init) => fetch(input, init));

  return async <T>(method: Method, path: string, requestOptions: RequestOptions = {}): Promise<T> => {
    const { body, authenticated = true } = requestOptions;
    const headers: Record<string, string> = {};
    const token = authenticated ? options.getToken() : null;
    if (token) headers.authorization = `Bearer ${token}`;
    const isForm = body instanceof FormData;
    // For a form, the browser must set the content type itself, because it carries the part boundary.
    if (body !== undefined && !isForm) headers['content-type'] = 'application/json';

    let response: Response;
    try {
      response = await send(`${options.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : isForm ? body : JSON.stringify(body)
      });
    } catch {
      throw new ApiError(UNREACHABLE, NETWORK_FAILURE_STATUS);
    }
    if (!response.ok) throw await toApiError(response);
    if (response.status === NO_CONTENT) return undefined as T;
    return (await response.json()) as T;
  };
}

/** Both services answer errors as { error, fields? }; anything else (a proxy's HTML page) gets a generic message. */
async function toApiError(response: Response): Promise<ApiError> {
  const fallback = `Request failed (${response.status})`;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new ApiError(fallback, response.status);
  }
  const { error, fields } = (typeof body === 'object' && body !== null ? body : {}) as {
    error?: unknown;
    fields?: unknown;
  };
  return new ApiError(
    typeof error === 'string' && error ? error : fallback,
    response.status,
    isStringRecord(fields) ? fields : {}
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.values(value).every((entry) => typeof entry === 'string');
}
