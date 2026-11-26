/** The request body or a path value is not acceptable. Answered with 400. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** No inspection record has the requested id. Answered with 404. */
export class InspectionNotFoundError extends Error {
  constructor() {
    super('Inspection not found');
    this.name = 'InspectionNotFoundError';
  }
}

export const REGISTER_REJECTIONS = {
  PROJECT_NOT_FOUND: 'Project not found',
  PROJECT_INACTIVE: 'Project is inactive',
  SYSTEM_NOT_FOUND: 'Firestop system not found in this project',
  SYSTEM_INACTIVE: 'Firestop system is inactive',
  AREA_NOT_FOUND: 'Area not found in this project',
  AREA_INACTIVE: 'Area is inactive'
} as const;

export type RegisterRejection = (typeof REGISTER_REJECTIONS)[keyof typeof REGISTER_REJECTIONS];

/**
 * The register answered, and its answer means the record cannot use this project, system or area.
 * Answered with 422 and the reason.
 */
export class RegisterRejectionError extends Error {
  constructor(readonly reason: RegisterRejection) {
    super(reason);
    this.name = 'RegisterRejectionError';
  }
}
