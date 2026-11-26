import type { RegisterArea, RegisterClient, RegisterProject, RegisterSystem } from './register-client.js';
import { RegisterUnavailableError } from './register-client.js';

export interface HttpRegisterClientOptions {
  /** Base address of the register service, without a trailing slash, e.g. http://localhost:8080 */
  baseUrl: string;
  /** How long to wait for an answer before giving up. */
  timeoutMs: number;
}

const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;

type JsonObject = Record<string, unknown>;

/**
 * Calls the register service's REST API. 200 is an answer, 404 means "not found", and everything else
 * (timeouts, connection failures, other statuses, unreadable bodies) is RegisterUnavailableError.
 */
export class HttpRegisterClient implements RegisterClient {
  private readonly baseUrl: string;

  constructor(private readonly options: HttpRegisterClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
  }

  async findProject(projectId: string, bearerToken: string): Promise<RegisterProject | undefined> {
    const body = await this.get(`/api/register/projects/${encodeURIComponent(projectId)}`, bearerToken);
    return body === undefined ? undefined : toProject(body);
  }

  async findSystem(projectId: string, systemId: string, bearerToken: string): Promise<RegisterSystem | undefined> {
    const path = `/api/register/projects/${encodeURIComponent(projectId)}/systems/${encodeURIComponent(systemId)}`;
    const body = await this.get(path, bearerToken);
    return body === undefined ? undefined : toSystem(body);
  }

  async findArea(projectId: string, areaId: string, bearerToken: string): Promise<RegisterArea | undefined> {
    const path = `/api/register/projects/${encodeURIComponent(projectId)}/areas/${encodeURIComponent(areaId)}`;
    const body = await this.get(path, bearerToken);
    return body === undefined ? undefined : toArea(body);
  }

  /** @returns the JSON body of a 200, or undefined for a 404 */
  private async get(path: string, bearerToken: string): Promise<JsonObject | undefined> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        headers: { accept: 'application/json', authorization: `Bearer ${bearerToken}` },
        signal: AbortSignal.timeout(this.options.timeoutMs)
      });
    } catch (error) {
      throw new RegisterUnavailableError(`The register service did not answer GET ${path}`, { cause: error });
    }
    if (response.status === HTTP_NOT_FOUND) {
      await response.body?.cancel();
      return undefined;
    }
    if (response.status !== HTTP_OK) {
      await response.body?.cancel();
      throw new RegisterUnavailableError(`The register service answered ${response.status} to GET ${path}`);
    }
    return readJsonObject(response, path);
  }
}

async function readJsonObject(response: Response, path: string): Promise<JsonObject> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new RegisterUnavailableError(`The register service sent an unreadable body for GET ${path}`, {
      cause: error
    });
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new RegisterUnavailableError(`The register service sent an unexpected body for GET ${path}`);
  }
  return body as JsonObject;
}

function toProject(body: JsonObject): RegisterProject {
  return {
    id: requireString(body, 'id'),
    code: requireString(body, 'code'),
    name: requireString(body, 'name'),
    active: requireBoolean(body, 'active')
  };
}

function toSystem(body: JsonObject): RegisterSystem {
  return {
    id: requireString(body, 'id'),
    projectId: requireString(body, 'projectId'),
    code: requireString(body, 'code'),
    substrate: requireString(body, 'substrate'),
    serviceType: requireString(body, 'serviceType'),
    fireRating: requireString(body, 'fireRating'),
    materials: requireString(body, 'materials'),
    installationMethod: requireString(body, 'installationMethod'),
    active: requireBoolean(body, 'active')
  };
}

function toArea(body: JsonObject): RegisterArea {
  return {
    id: requireString(body, 'id'),
    projectId: requireString(body, 'projectId'),
    name: requireString(body, 'name'),
    active: requireBoolean(body, 'active')
  };
}

function requireString(body: JsonObject, field: string): string {
  const value = body[field];
  if (typeof value !== 'string') throw missingField(field);
  return value;
}

function requireBoolean(body: JsonObject, field: string): boolean {
  const value = body[field];
  if (typeof value !== 'boolean') throw missingField(field);
  return value;
}

function missingField(field: string): RegisterUnavailableError {
  return new RegisterUnavailableError(`The register service's answer has no valid "${field}" field`);
}
