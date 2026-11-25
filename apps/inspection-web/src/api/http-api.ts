import type { Api } from './api';
import { createRequester, type HttpRequestOptions } from './http-request';

export type HttpApiOptions = HttpRequestOptions;

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
