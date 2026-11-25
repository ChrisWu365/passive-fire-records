import type { Api } from './api';
import { ApiError } from './api-error';

export interface HttpApiOptions {
  /** Origin the API paths are appended to. Empty means the page's own origin, which is the normal case. */
  baseUrl: string;
  /** Returns the current sign-in token, or null when nobody is signed in. */
  getToken: () => string | null;
  /** Defaults to the browser's fetch; tests pass their own. */
  fetch?: typeof fetch;
}

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';

interface RequestOptions {
  /** Sent as JSON, or as multipart form data when it is a FormData. */
  body?: unknown;
  /** False for sign-in, which must not carry a previous session's token. */
  authenticated?: boolean;
}

type Requester = <T>(method: Method, path: string, options?: RequestOptions) => Promise<T>;

const UNREACHABLE = 'The server could not be reached. Check your connection and try again.';
const NO_CONTENT = 204;
const NETWORK_FAILURE_STATUS = 0;

const REGISTER = '/api/register';
const INSPECTIONS = '/api/inspections';

/**
 * The real Api: calls both services over HTTP through one origin. Paths under /api/register go to the
 * register service and every other /api path to the inspection service; the gateway does the routing.
 */
export function createHttpApi(options: HttpApiOptions): Api {
  const request = createRequester(options);
  const project = (projectId: string) => `${REGISTER}/projects/${encodeURIComponent(projectId)}`;
  const system = (projectId: string, systemId: string) =>
    `${project(projectId)}/systems/${encodeURIComponent(systemId)}`;
  const inspection = (id: string) => `${INSPECTIONS}/${encodeURIComponent(id)}`;

  return {
    auth: {
      login: (email, password) =>
        request('POST', '/api/auth/login', { body: { email, password }, authenticated: false })
    },
    register: {
      listProjects: () => request('GET', `${REGISTER}/projects`),
      createProject: (input) => request('POST', `${REGISTER}/projects`, { body: input }),
      updateProject: (projectId, input) => request('PUT', project(projectId), { body: input }),
      listSystems: (projectId) => request('GET', `${project(projectId)}/systems`),
      createSystem: (projectId, input) => request('POST', `${project(projectId)}/systems`, { body: input }),
      updateSystem: (projectId, systemId, input) => request('PUT', system(projectId, systemId), { body: input })
    },
    inspections: {
      list: () => request('GET', INSPECTIONS),
      create: (input) => request('POST', INSPECTIONS, { body: input }),
      update: (id, input) => request('PUT', inspection(id), { body: input }),
      uploadPhotos: (id, files) => {
        const form = new FormData();
        files.forEach((file) => form.append('photos', file));
        return request('POST', `${inspection(id)}/photos`, { body: form });
      },
      deletePhoto: (id, position) => request('DELETE', `${inspection(id)}/photos/${position}`),
      requestAiDraft: (id, instruction) => request('POST', `${inspection(id)}/ai-summary`, { body: { instruction } })
    }
  };
}

function createRequester(options: HttpApiOptions): Requester {
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
