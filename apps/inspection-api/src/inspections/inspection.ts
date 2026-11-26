export const INSPECTION_STATUSES = ['DRAFT', 'IN_PROGRESS', 'ACTION_REQUIRED', 'COMPLETED'] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export type Severity = (typeof SEVERITIES)[number];

/** NONE: no draft requested yet. DONE: a draft is stored. FAILED: the last request to the AI provider failed. */
export const AI_STATUSES = ['NONE', 'DONE', 'FAILED'] as const;
export type AiStatus = (typeof AI_STATUSES)[number];

export interface Observation {
  id: string;
  description: string;
  severity: Severity;
  remedialAction: string;
}

/**
 * The firestop system's details as they were in the register when the record was stored.
 * Later edits to the register do not change this copy.
 */
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
  /** Identifier chosen by the device that created the record; makes a repeated upload return the same record. */
  clientId: string | null;
  projectId: string;
  /** Copied from the register when the record was stored. */
  projectName: string;
  systemId: string;
  system: SystemSnapshot;
  /** The level or area of the building the record is in, when one was chosen. */
  areaId: string | null;
  /** Copied from the register when the area was set. Later renames do not change this copy. */
  areaName: string | null;
  /** The detail within the area, or the whole location when no area was chosen. */
  location: string;
  notes: string;
  status: InspectionStatus;
  inspectorId: string;
  inspectorName: string;
  observations: Observation[];
  /** Public paths of the uploaded photos, in upload order. */
  photos: string[];
  aiInstruction: string | null;
  aiSummary: string | null;
  aiStatus: AiStatus;
  /** When the record was captured on the device (ISO 8601). Differs from createdAt for records made offline. */
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** Everything the store needs to insert a record; the store assigns id, createdAt and updatedAt. */
export type NewInspection = Omit<Inspection, 'id' | 'createdAt' | 'updatedAt'>;
