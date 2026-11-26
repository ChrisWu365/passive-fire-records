export interface RegisterProject {
  id: string;
  code: string;
  name: string;
  active: boolean;
}

export interface RegisterSystem {
  id: string;
  projectId: string;
  code: string;
  substrate: string;
  serviceType: string;
  fireRating: string;
  materials: string;
  installationMethod: string;
  active: boolean;
}

/** A level or area of a project's building, as the register holds it. */
export interface RegisterArea {
  id: string;
  projectId: string;
  name: string;
  active: boolean;
}

/**
 * Thrown when the register service cannot give an answer: it is unreachable, too slow, or failing.
 * It never means "not found"; a missing project, system or area is a normal answer.
 */
export class RegisterUnavailableError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'RegisterUnavailableError';
  }
}

/**
 * Read access to the register service, which owns projects and their approved firestop systems.
 * Each call is made on behalf of the signed-in user, whose bearer token is forwarded.
 */
export interface RegisterClient {
  /**
   * @returns the project, or undefined when the register has no project with this id
   * @throws RegisterUnavailableError when the register cannot answer
   */
  findProject(projectId: string, bearerToken: string): Promise<RegisterProject | undefined>;

  /**
   * @returns the system, or undefined when the project has no system with this id
   * @throws RegisterUnavailableError when the register cannot answer
   */
  findSystem(projectId: string, systemId: string, bearerToken: string): Promise<RegisterSystem | undefined>;

  /**
   * @returns the area, or undefined when the project has no area with this id
   * @throws RegisterUnavailableError when the register cannot answer
   */
  findArea(projectId: string, areaId: string, bearerToken: string): Promise<RegisterArea | undefined>;
}
