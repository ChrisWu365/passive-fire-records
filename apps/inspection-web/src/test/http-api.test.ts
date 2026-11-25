import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Api } from '../api/api';
import { ApiError } from '../api/api-error';
import { createHttpApi } from '../api/http-api';
import type { FirestopSystemInput, InspectionInput } from '../api/types';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const SYSTEM_ID = '33333333-3333-4333-8333-333333333333';
const INSPECTION_ID = '77777777-7777-4777-8777-777777777777';
const TOKEN = 'header.payload.signature';

const SYSTEM_INPUT: FirestopSystemInput = {
  code: 'SYS-05',
  substrate: 'Concrete floor',
  serviceType: 'Metal pipe',
  fireRating: '-/120/120',
  materials: 'Demo wrap E',
  installationMethod: 'Wrap the pipe twice.'
};

const INSPECTION_INPUT: InspectionInput = {
  projectId: PROJECT_ID,
  systemId: SYSTEM_ID,
  location: 'Level 2 riser',
  notes: 'Sealed today.',
  status: 'DRAFT',
  observations: []
};

interface SentRequest {
  url: string;
  method: string;
  headers: Headers;
  body: BodyInit | null | undefined;
}

let sent: SentRequest[];
let respond: () => Response | Promise<Response>;
let token: string | null;
let api: Api;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  sent = [];
  token = TOKEN;
  respond = () => json(200, {});
  const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: init?.body
    });
    return respond();
  });
  api = createHttpApi({ baseUrl: '', getToken: () => token, fetch: fakeFetch as typeof fetch });
});

function onlyRequest(): SentRequest {
  expect(sent).toHaveLength(1);
  return sent[0];
}

describe('HTTP API: the register', () => {
  it('AC-4.3 listProjects reads /api/register/projects with the sign-in token', async () => {
    respond = () => json(200, [{ id: PROJECT_ID, code: 'HVA', name: 'Harbour View', address: null, active: true }]);

    const projects = await api.register.listProjects();

    const request = onlyRequest();
    expect(request.method).toBe('GET');
    expect(request.url).toBe('/api/register/projects');
    expect(request.headers.get('authorization')).toBe(`Bearer ${TOKEN}`);
    expect(projects).toEqual([{ id: PROJECT_ID, code: 'HVA', name: 'Harbour View', address: null, active: true }]);
  });

  it('AC-4.3 listSystems reads the systems of one project', async () => {
    respond = () => json(200, []);

    await api.register.listSystems(PROJECT_ID);

    expect(onlyRequest().url).toBe(`/api/register/projects/${PROJECT_ID}/systems`);
  });

  it('AC-4.1 createSystem posts the system as JSON under its project', async () => {
    respond = () => json(201, { ...SYSTEM_INPUT, id: SYSTEM_ID, projectId: PROJECT_ID, active: true });

    const created = await api.register.createSystem(PROJECT_ID, SYSTEM_INPUT);

    const request = onlyRequest();
    expect(request.method).toBe('POST');
    expect(request.url).toBe(`/api/register/projects/${PROJECT_ID}/systems`);
    expect(request.headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(String(request.body))).toEqual(SYSTEM_INPUT);
    expect(created.id).toBe(SYSTEM_ID);
  });

  it('AC-4.1 updateSystem puts the system at its own path', async () => {
    await api.register.updateSystem(PROJECT_ID, SYSTEM_ID, { ...SYSTEM_INPUT, active: false });

    const request = onlyRequest();
    expect(request.method).toBe('PUT');
    expect(request.url).toBe(`/api/register/projects/${PROJECT_ID}/systems/${SYSTEM_ID}`);
    expect(JSON.parse(String(request.body))).toEqual({ ...SYSTEM_INPUT, active: false });
  });

  it('AC-4.1 createProject posts and updateProject puts', async () => {
    await api.register.createProject({ code: 'NEW', name: 'New Tower' });
    await api.register.updateProject(PROJECT_ID, { code: 'NEW', name: 'New Tower', active: false });

    expect(sent.map((request) => `${request.method} ${request.url}`)).toEqual([
      'POST /api/register/projects',
      `PUT /api/register/projects/${PROJECT_ID}`
    ]);
    expect(JSON.parse(String(sent[1].body))).toEqual({ code: 'NEW', name: 'New Tower', active: false });
  });
});

describe('HTTP API: inspections and sign-in', () => {
  it('AC-4.3 create posts the record and update puts it under its id', async () => {
    await api.inspections.create(INSPECTION_INPUT);
    await api.inspections.update(INSPECTION_ID, INSPECTION_INPUT);

    expect(sent.map((request) => `${request.method} ${request.url}`)).toEqual([
      'POST /api/inspections',
      `PUT /api/inspections/${INSPECTION_ID}`
    ]);
    expect(JSON.parse(String(sent[0].body))).toEqual(INSPECTION_INPUT);
  });

  it('AC-4.3 list reads /api/inspections', async () => {
    respond = () => json(200, []);

    expect(await api.inspections.list()).toEqual([]);
    expect(onlyRequest().url).toBe('/api/inspections');
  });

  it('AC-4.3 requestAiDraft posts the instruction', async () => {
    await api.inspections.requestAiDraft(INSPECTION_ID, 'Describe the seal.');

    const request = onlyRequest();
    expect(request.method).toBe('POST');
    expect(request.url).toBe(`/api/inspections/${INSPECTION_ID}/ai-summary`);
    expect(JSON.parse(String(request.body))).toEqual({ instruction: 'Describe the seal.' });
  });

  it('AC-4.3 uploadPhotos sends the files as a form, leaving the content type to the browser', async () => {
    const file = new File(['image-bytes'], 'seal.png', { type: 'image/png' });

    await api.inspections.uploadPhotos(INSPECTION_ID, [file]);

    const request = onlyRequest();
    expect(request.method).toBe('POST');
    expect(request.url).toBe(`/api/inspections/${INSPECTION_ID}/photos`);
    expect(request.headers.has('content-type')).toBe(false);
    expect(request.body).toBeInstanceOf(FormData);
    expect((request.body as FormData).getAll('photos')).toEqual([file]);
  });

  it('AC-4.3 deletePhoto deletes by position', async () => {
    await api.inspections.deletePhoto(INSPECTION_ID, 1);

    const request = onlyRequest();
    expect(request.method).toBe('DELETE');
    expect(request.url).toBe(`/api/inspections/${INSPECTION_ID}/photos/1`);
  });

  it('AC-4.2 login posts the credentials and sends no token', async () => {
    token = null;
    respond = () => json(200, { token: TOKEN, user: { id: 'user-admin', email: 'admin@example.com', name: 'Demo Admin', role: 'ADMIN' } });

    const session = await api.auth.login('admin@example.com', 'Admin123!');

    const request = onlyRequest();
    expect(request.method).toBe('POST');
    expect(request.url).toBe('/api/auth/login');
    expect(request.headers.has('authorization')).toBe(false);
    expect(JSON.parse(String(request.body))).toEqual({ email: 'admin@example.com', password: 'Admin123!' });
    expect(session.user.role).toBe('ADMIN');
  });
});

describe('HTTP API: one origin', () => {
  it('AC-4.3 every call, to either service, goes to a path under /api on the page\'s own origin', async () => {
    await api.register.listProjects();
    await api.register.listSystems(PROJECT_ID);
    await api.register.createSystem(PROJECT_ID, SYSTEM_INPUT);
    await api.inspections.list();
    await api.inspections.create(INSPECTION_INPUT);
    await api.inspections.requestAiDraft(INSPECTION_ID, 'x');

    expect(sent.length).toBe(6);
    for (const request of sent) {
      expect(request.url).toMatch(/^\/api\//);
    }
  });

  it('AC-4.3 a configured base URL is put in front of every path', async () => {
    api = createHttpApi({
      baseUrl: 'https://demo.example.com',
      getToken: () => TOKEN,
      fetch: (async (input: RequestInfo | URL) => {
        sent.push({ url: String(input), method: 'GET', headers: new Headers(), body: undefined });
        return json(200, []);
      }) as typeof fetch
    });

    await api.register.listProjects();

    expect(onlyRequest().url).toBe('https://demo.example.com/api/register/projects');
  });
});

describe('HTTP API: errors', () => {
  async function failure(call: () => Promise<unknown>): Promise<ApiError> {
    try {
      await call();
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      return error as ApiError;
    }
    throw new Error('The call was expected to fail');
  }

  it('AC-4.1 a validation error carries the status, the message and the field messages', async () => {
    respond = () => json(400, { error: 'Validation failed', fields: { code: 'code is required' } });

    const error = await failure(() => api.register.createSystem(PROJECT_ID, SYSTEM_INPUT));

    expect(error.status).toBe(400);
    expect(error.message).toBe('Validation failed');
    expect(error.fields).toEqual({ code: 'code is required' });
  });

  it.each([
    [409, 'The project already has a system with code SYS-01'],
    [422, 'Firestop system is inactive'],
    [503, 'The register service is unavailable. Try again later.'],
    [403, 'Insufficient permissions']
  ])('AC-4.3 a %i answer becomes an ApiError with the server\'s message', async (status, message) => {
    respond = () => json(status, { error: message });

    const error = await failure(() => api.inspections.create(INSPECTION_INPUT));

    expect(error.status).toBe(status);
    expect(error.message).toBe(message);
    expect(error.fields).toEqual({});
  });

  it('AC-4.3 an error answer that is not JSON still becomes an ApiError with its status', async () => {
    respond = () => new Response('<html>Bad gateway</html>', { status: 502 });

    const error = await failure(() => api.inspections.list());

    expect(error.status).toBe(502);
    expect(error.message).toBe('Request failed (502)');
  });

  it('AC-4.3 when the server cannot be reached, the error says so with status 0', async () => {
    respond = () => { throw new TypeError('Failed to fetch'); };

    const error = await failure(() => api.inspections.list());

    expect(error.status).toBe(0);
    expect(error.message).toBe('The server could not be reached. Check your connection and try again.');
  });
});
