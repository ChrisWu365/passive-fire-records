import type {
  AiDraftResult,
  Area,
  AreaInput,
  FirestopSystem,
  FirestopSystemInput,
  Inspection,
  InspectionInput,
  Project,
  ProjectInput,
  Session
} from './types';

/** Every method rejects with ApiError when the request fails. */
export interface AuthApi {
  login(email: string, password: string): Promise<Session>;
}

/** The register service: projects and their approved firestop systems. */
export interface RegisterApi {
  /** Every project, active or not. */
  listProjects(): Promise<Project[]>;
  createProject(input: ProjectInput): Promise<Project>;
  updateProject(projectId: string, input: ProjectInput): Promise<Project>;
  /** Every system of the project, active or not. */
  listSystems(projectId: string): Promise<FirestopSystem[]>;
  createSystem(projectId: string, input: FirestopSystemInput): Promise<FirestopSystem>;
  updateSystem(projectId: string, systemId: string, input: FirestopSystemInput): Promise<FirestopSystem>;
  /** Every area of the project, active or not, ordered by name. */
  listAreas(projectId: string): Promise<Area[]>;
  createArea(projectId: string, input: AreaInput): Promise<Area>;
  updateArea(projectId: string, areaId: string, input: AreaInput): Promise<Area>;
}

/** The inspection service: records, photos and AI drafts. */
export interface InspectionApi {
  list(): Promise<Inspection[]>;
  create(input: InspectionInput): Promise<Inspection>;
  update(id: string, input: InspectionInput): Promise<Inspection>;
  uploadPhotos(id: string, files: File[]): Promise<Inspection>;
  deletePhoto(id: string, position: number): Promise<Inspection>;
  requestAiDraft(id: string, instruction: string): Promise<AiDraftResult>;
}

/** Everything the screens need from the two services. Screens receive it through ApiProvider. */
export interface Api {
  auth: AuthApi;
  register: RegisterApi;
  inspections: InspectionApi;
}
