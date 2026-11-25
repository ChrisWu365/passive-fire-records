import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { HttpRegisterClient } from '../src/register/http-register-client.js';
import { RegisterUnavailableError } from '../src/register/register-client.js';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const SYSTEM_ID = '33333333-3333-4333-8333-333333333333';
const TOKEN = 'header.payload.signature';
const TIMEOUT_MS = 200;
const SLOWER_THAN_TIMEOUT_MS = 1500;

const PROJECT_JSON = {
  id: PROJECT_ID,
  code: 'HVA',
  name: 'Harbour View Apartments',
  address: '1 Quay Street',
  active: true,
  createdAt: '2030-01-01T00:00:00Z',
  updatedAt: '2030-01-01T00:00:00Z'
};

const SYSTEM_JSON = {
  id: SYSTEM_ID,
  projectId: PROJECT_ID,
  code: 'SYS-01',
  substrate: 'Plasterboard wall',
  serviceType: 'Plastic pipe up to 50 mm',
  fireRating: '-/60/60',
  materials: 'Demo collar A',
  installationMethod: 'Fit one collar on each side of the wall.',
  active: true,
  createdAt: '2030-01-01T00:00:00Z',
  updatedAt: '2030-01-01T00:00:00Z'
};

interface SeenRequest {
  method: string | undefined;
  url: string | undefined;
  authorization: string | undefined;
}

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

/** A stand-in for the register service: a real HTTP server whose answer each test chooses. */
let server: Server;
let baseUrl: string;
let handler: Handler;
let seen: SeenRequest[];
let pendingTimers: NodeJS.Timeout[];

before(async () => {
  server = createServer((request, response) => {
    seen.push({ method: request.method, url: request.url, authorization: request.headers.authorization });
    handler(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(() => {
  seen = [];
  pendingTimers = [];
  handler = (_request, response) => respondJson(response, 200, SYSTEM_JSON);
});

after(async () => {
  pendingTimers.forEach(clearTimeout);
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function respondJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

function client(): HttpRegisterClient {
  return new HttpRegisterClient({ baseUrl, timeoutMs: TIMEOUT_MS });
}

test('AC-3.1 findSystem requests the system under its project and forwards the bearer token', async () => {
  const system = await client().findSystem(PROJECT_ID, SYSTEM_ID, TOKEN);

  assert.deepEqual(seen, [{
    method: 'GET',
    url: `/api/register/projects/${PROJECT_ID}/systems/${SYSTEM_ID}`,
    authorization: `Bearer ${TOKEN}`
  }]);
  assert.deepEqual(system, {
    id: SYSTEM_ID,
    projectId: PROJECT_ID,
    code: 'SYS-01',
    substrate: 'Plasterboard wall',
    serviceType: 'Plastic pipe up to 50 mm',
    fireRating: '-/60/60',
    materials: 'Demo collar A',
    installationMethod: 'Fit one collar on each side of the wall.',
    active: true
  });
});

test('AC-3.1 findProject requests the project and forwards the bearer token', async () => {
  handler = (_request, response) => respondJson(response, 200, PROJECT_JSON);

  const project = await client().findProject(PROJECT_ID, TOKEN);

  assert.deepEqual(seen, [{
    method: 'GET',
    url: `/api/register/projects/${PROJECT_ID}`,
    authorization: `Bearer ${TOKEN}`
  }]);
  assert.deepEqual(project, { id: PROJECT_ID, code: 'HVA', name: 'Harbour View Apartments', active: true });
});

test('AC-3.1 an inactive system is returned as an answer, with active false', async () => {
  handler = (_request, response) => respondJson(response, 200, { ...SYSTEM_JSON, active: false });

  const system = await client().findSystem(PROJECT_ID, SYSTEM_ID, TOKEN);

  assert.equal(system?.active, false);
});

test('AC-3.2 a 404 from the register means not found: findSystem and findProject return undefined', async () => {
  handler = (_request, response) => respondJson(response, 404, { error: 'Firestop system not found' });

  assert.equal(await client().findSystem(PROJECT_ID, SYSTEM_ID, TOKEN), undefined);
  assert.equal(await client().findProject(PROJECT_ID, TOKEN), undefined);
});

for (const status of [400, 401, 403, 500, 502, 503]) {
  test(`AC-3.3 a ${status} from the register is reported as unavailable, not as not-found`, async () => {
    handler = (_request, response) => respondJson(response, status, { error: 'nope' });

    await assert.rejects(client().findSystem(PROJECT_ID, SYSTEM_ID, TOKEN), RegisterUnavailableError);
    await assert.rejects(client().findProject(PROJECT_ID, TOKEN), RegisterUnavailableError);
  });
}

test('AC-3.3 a register that answers too slowly is reported as unavailable once the timeout passes', async () => {
  handler = (_request, response) => {
    pendingTimers.push(setTimeout(() => respondJson(response, 200, SYSTEM_JSON), SLOWER_THAN_TIMEOUT_MS));
  };
  const startedAt = Date.now();

  await assert.rejects(client().findSystem(PROJECT_ID, SYSTEM_ID, TOKEN), RegisterUnavailableError);

  assert.ok(Date.now() - startedAt < SLOWER_THAN_TIMEOUT_MS, 'the client must give up at its timeout');
});

test('AC-3.3 a register that cannot be reached is reported as unavailable', async () => {
  const closedPort = await findClosedPort();
  const unreachable = new HttpRegisterClient({ baseUrl: `http://127.0.0.1:${closedPort}`, timeoutMs: TIMEOUT_MS });

  await assert.rejects(unreachable.findSystem(PROJECT_ID, SYSTEM_ID, TOKEN), RegisterUnavailableError);
  await assert.rejects(unreachable.findProject(PROJECT_ID, TOKEN), RegisterUnavailableError);
});

test('AC-3.3 a 200 whose body is not JSON is reported as unavailable', async () => {
  handler = (_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' });
    response.end('<html>gateway page</html>');
  };

  await assert.rejects(client().findSystem(PROJECT_ID, SYSTEM_ID, TOKEN), RegisterUnavailableError);
});

test('AC-3.3 a 200 whose body lacks the expected fields is reported as unavailable', async () => {
  handler = (_request, response) => respondJson(response, 200, { id: SYSTEM_ID, code: 'SYS-01' });

  await assert.rejects(client().findSystem(PROJECT_ID, SYSTEM_ID, TOKEN), RegisterUnavailableError);
});

async function findClosedPort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}
