import { randomUUID } from 'node:crypto';
import { ValidationError } from './errors.js';
import {
  INSPECTION_STATUSES,
  SEVERITIES,
  type InspectionStatus,
  type Observation,
  type Severity
} from './inspection.js';

/** What a client may send when creating or updating a record, after validation. */
export interface InspectionInput {
  projectId: string;
  systemId: string;
  location: string;
  notes: string;
  status: InspectionStatus;
  observations: Observation[];
  /** Only honoured on create. */
  clientId: string | null;
  /** Only honoured on create; undefined means "now". */
  capturedAt: string | undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LOCATION_LENGTH = 200;
const MAX_NOTES_LENGTH = 5000;
const MAX_OBSERVATIONS = 50;
const MAX_OBSERVATION_TEXT_LENGTH = 1000;
const MAX_OBSERVATION_ID_LENGTH = 100;
const DEFAULT_STATUS: InspectionStatus = 'DRAFT';
const DEFAULT_SEVERITY: Severity = 'LOW';

type Body = Record<string, unknown>;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/**
 * Validates a create or update body. Nothing is trusted: every field is checked for type, presence and
 * size before the rest of the service sees it.
 *
 * @throws ValidationError naming the first field that is wrong
 */
export function parseInspectionInput(body: unknown): InspectionInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('The request body must be a JSON object');
  }
  const fields = body as Body;
  return {
    projectId: requiredUuid(fields, 'projectId'),
    systemId: requiredUuid(fields, 'systemId'),
    location: location(fields),
    notes: notes(fields),
    status: status(fields),
    observations: observations(fields),
    clientId: clientId(fields),
    capturedAt: capturedAt(fields)
  };
}

function requiredUuid(fields: Body, name: string): string {
  const value = fields[name];
  if (!isUuid(value)) throw new ValidationError(`${name} is required and must be a UUID`);
  return value.toLowerCase();
}

function location(fields: Body): string {
  const value = fields.location;
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError('location is required');
  const trimmed = value.trim();
  if (trimmed.length > MAX_LOCATION_LENGTH) {
    throw new ValidationError(`location must be at most ${MAX_LOCATION_LENGTH} characters`);
  }
  return trimmed;
}

function notes(fields: Body): string {
  const value = fields.notes ?? '';
  if (typeof value !== 'string') throw new ValidationError('notes must be text');
  if (value.length > MAX_NOTES_LENGTH) {
    throw new ValidationError(`notes must be at most ${MAX_NOTES_LENGTH} characters`);
  }
  return value;
}

function status(fields: Body): InspectionStatus {
  const value = fields.status;
  if (value === undefined || value === null) return DEFAULT_STATUS;
  if (!INSPECTION_STATUSES.includes(value as InspectionStatus)) {
    throw new ValidationError(`status must be one of ${INSPECTION_STATUSES.join(', ')}`);
  }
  return value as InspectionStatus;
}

function clientId(fields: Body): string | null {
  const value = fields.clientId;
  if (value === undefined || value === null) return null;
  if (!isUuid(value)) throw new ValidationError('clientId must be a UUID');
  return value.toLowerCase();
}

function capturedAt(fields: Body): string | undefined {
  const value = fields.capturedAt;
  if (value === undefined || value === null) return undefined;
  const time = typeof value === 'string' ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(time)) throw new ValidationError('capturedAt must be an ISO 8601 date and time');
  return new Date(time).toISOString();
}

function observations(fields: Body): Observation[] {
  const value = fields.observations;
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError('observations must be a list');
  if (value.length > MAX_OBSERVATIONS) {
    throw new ValidationError(`observations must have at most ${MAX_OBSERVATIONS} entries`);
  }
  const parsed = value.map(observation);
  if (new Set(parsed.map((entry) => entry.id)).size !== parsed.length) {
    throw new ValidationError('observations must not repeat an id');
  }
  return parsed;
}

function observation(value: unknown, index: number): Observation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError(`observations[${index}] must be an object`);
  }
  const fields = value as Body;
  return {
    id: observationId(fields.id, index),
    description: observationText(fields.description, `observations[${index}].description`),
    severity: severity(fields.severity, index),
    remedialAction: observationText(fields.remedialAction, `observations[${index}].remedialAction`)
  };
}

function observationId(value: unknown, index: number): string {
  if (value === undefined || value === null) return randomUUID();
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_OBSERVATION_ID_LENGTH) {
    throw new ValidationError(`observations[${index}].id must be a short text value`);
  }
  return value;
}

function observationText(value: unknown, name: string): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new ValidationError(`${name} must be text`);
  if (value.length > MAX_OBSERVATION_TEXT_LENGTH) {
    throw new ValidationError(`${name} must be at most ${MAX_OBSERVATION_TEXT_LENGTH} characters`);
  }
  return value;
}

function severity(value: unknown, index: number): Severity {
  if (value === undefined || value === null) return DEFAULT_SEVERITY;
  if (!SEVERITIES.includes(value as Severity)) {
    throw new ValidationError(`observations[${index}].severity must be one of ${SEVERITIES.join(', ')}`);
  }
  return value as Severity;
}
