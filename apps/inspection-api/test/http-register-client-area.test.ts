import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { HttpRegisterClient } from '../src/register/http-register-client.js';
import { RegisterUnavailableError } from '../src/register/register-client.js';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const AREA_ID = '66666666-6666-4666-8666-666666666666';
const TOKEN = 'header.payload.signature';
const TIMEOUT_MS = 200;
const SLOWER_THAN_TIMEOUT_MS = 1500;

const AREA_JSON = {
  id: AREA_ID,
  projectId: PROJECT_ID,
  name: 'Level 4',
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
  handler = (_request, response) => respondJson(response, 200, AREA_JSON);
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

test('AC-9.3 findArea requests the area under its project and forwards the bearer token', async () => {
  const area = await client().findArea(PROJECT_ID, AREA_ID, TOKEN);

  assert.deepEqual(seen, [{
    method: 'GET',
    url: `/api/register/projects/${PROJECT_ID}/areas/${AREA_ID}`,
    authorization: `Bearer ${TOKEN}`
  }]);
  assert.deepEqual(area, { id: AREA_ID, projectId: PROJECT_ID, name: 'Level 4', active: true });
});

test('AC-9.4 an inactive area is returned as an answer, with active false', async () => {
  handler = (_request, response) => respondJson(response, 200, { ...AREA_JSON, active: false });

  const area = await client().findArea(PROJECT_ID, AREA_ID, TOKEN);

  assert.equal(area?.active, false);
});

test('AC-9.4 a 404 from the register means not found: findArea returns undefined', async () => {
  handler = (_request, response) => respondJson(response, 404, { error: 'Area not found' });

  assert.equal(await client().findArea(PROJECT_ID, AREA_ID, TOKEN), undefined);
});

for (const status of [400, 401, 403, 500, 502, 503]) {
  test(`AC-9.4 a ${status} from the register for an area is reported as unavailable, not as not-found`, async () => {
    handler = (_request, response) => respondJson(response, status, { error: 'nope' });

    await assert.rejects(client().findArea(PROJECT_ID, AREA_ID, TOKEN), RegisterUnavailableError);
  });
}

test('AC-9.4 a register that answers too slowly for an area is reported as unavailable at the timeout', async () => {
  handler = (_request, response) => {
    pendingTimers.push(setTimeout(() => respondJson(response, 200, AREA_JSON), SLOWER_THAN_TIMEOUT_MS));
  };
  const startedAt = Date.now();

  await assert.rejects(client().findArea(PROJECT_ID, AREA_ID, TOKEN), RegisterUnavailableError);

  assert.ok(Date.now() - startedAt < SLOWER_THAN_TIMEOUT_MS, 'the client must give up at its timeout');
});

test('AC-9.4 a 200 for an area whose body lacks the expected fields is reported as unavailable', async () => {
  handler = (_request, response) => respondJson(response, 200, { id: AREA_ID });

  await assert.rejects(client().findArea(PROJECT_ID, AREA_ID, TOKEN), RegisterUnavailableError);
});
