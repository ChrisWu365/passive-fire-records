export type Role = 'ADMIN' | 'INSPECTOR' | 'VIEWER';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface Session {
  token: string;
  user: User;
}

/** A construction project in the register. */
export interface Project {
  id: string;
  code: string;
  name: string;
  address: string | null;
  active: boolean;
}

export interface ProjectInput {
  code: string;
  name: string;
  address?: string;
  /** Left out, the server keeps the current value (true for a new project). */
  active?: boolean;
}

/** One approved firestop system of a project. */
export interface FirestopSystem {
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

export interface FirestopSystemInput {
  code: string;
  substrate: string;
  serviceType: string;
  fireRating: string;
  materials: string;
  installationMethod: string;
  /** Left out, the server keeps the current value (true for a new system). */
  active?: boolean;
}

export const STATUSES = ['DRAFT', 'IN_PROGRESS', 'ACTION_REQUIRED', 'COMPLETED'] as const;
export type Status = (typeof STATUSES)[number];

export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type Severity = (typeof SEVERITIES)[number];

export type AiStatus = 'NONE' | 'DONE' | 'FAILED';

export interface Observation {
  /** Absent until the server has stored the observation. */
  id?: string;
  description: string;
  severity: Severity;
  remedialAction: string;
}

/** The system's details as copied onto a record when it was stored. */
export interface SystemSnapshot {
  code: string;
  substrate: string;
  serviceType: string;
  fireRating: string;
  materials: string;
  installationMethod: string;
}

export interface Inspection {
  id: string;
  clientId: string | null;
  projectId: string;
  projectName: string;
  systemId: string;
  system: SystemSnapshot;
  location: string;
  notes: string;
  status: Status;
  inspectorId: string;
  inspectorName: string;
  observations: Observation[];
  photos: string[];
  aiInstruction: string | null;
  aiSummary: string | null;
  aiStatus: AiStatus;
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** What the form sends when creating or updating a record. */
export interface InspectionInput {
  projectId: string;
  systemId: string;
  location: string;
  notes: string;
  status: Status;
  observations: Observation[];
  /**
   * Create only. Chosen by the device for a record captured offline: the server stores at most one record
   * per clientId, so sending the same record again returns the stored one instead of making a second.
   */
  clientId?: string;
  /** Create only. When the record was captured on the device (ISO 8601); the server defaults it to now. */
  capturedAt?: string;
}

export interface AiDraftResult {
  summary: string;
  source: 'mock' | 'provider';
  requiresReview: true;
  inspection: Inspection;
}
