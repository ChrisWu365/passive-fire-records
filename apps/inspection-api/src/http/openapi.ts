/**
 * The API description served at /api-docs. It is written out here, not generated from source comments,
 * so it is identical in development and in the built image, where the TypeScript sources are absent.
 */

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
});

const inspectionResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Inspection' } } }
});

const inspectionBody = {
  required: true,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/InspectionInput' } } }
};

const idParameter = {
  in: 'path',
  name: 'id',
  required: true,
  schema: { type: 'string', format: 'uuid' },
  description: 'Inspection id'
};

const secured = [{ bearerAuth: [] }];

const UNAUTHORIZED = errorResponse('No token, or the token is invalid or expired');
const FORBIDDEN = errorResponse('The signed-in role may not do this');
const NOT_FOUND = errorResponse('Inspection not found');
const INVALID = errorResponse('Invalid input');
const REJECTED = errorResponse('The project or system is missing or inactive in the register');
const REGISTER_DOWN = errorResponse('The register service is unavailable');

export const openApiDocument = {
  openapi: '3.0.0',
  info: {
    title: 'Passive Fire Inspection API',
    version: '0.2.0',
    description:
      'Inspection records, photos and AI-assisted drafts. Each record refers to a project and a firestop '
      + 'system held by the register service, and keeps its own copy of the system details.'
  },
  tags: [{ name: 'Health' }, { name: 'Auth' }, { name: 'Inspections' }],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        responses: { 200: { description: 'The service is up' } }
      }
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Sign in',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } }
        },
        responses: {
          200: {
            description: 'Signed in',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } }
          },
          401: errorResponse('Invalid email or password')
        }
      }
    },
    '/api/me': {
      get: {
        tags: ['Auth'],
        summary: 'The signed-in user',
        security: secured,
        responses: {
          200: {
            description: 'The user in the token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } }
          },
          401: UNAUTHORIZED
        }
      }
    },
    '/api/inspections': {
      get: {
        tags: ['Inspections'],
        summary: 'List inspections, most recently updated first',
        security: secured,
        responses: {
          200: {
            description: 'All inspections',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Inspection' } }
              }
            }
          },
          401: UNAUTHORIZED
        }
      },
      post: {
        tags: ['Inspections'],
        summary: 'Create an inspection',
        description:
          'The project and system are checked with the register. Sending a clientId makes the request '
          + 'repeatable: a second request with the same clientId returns the stored record with 200.',
        security: secured,
        requestBody: inspectionBody,
        responses: {
          201: inspectionResponse('Created'),
          200: inspectionResponse('A record with this clientId already existed; it is returned unchanged'),
          400: INVALID,
          401: UNAUTHORIZED,
          403: FORBIDDEN,
          422: REJECTED,
          503: REGISTER_DOWN
        }
      }
    },
    '/api/inspections/{id}': {
      get: {
        tags: ['Inspections'],
        summary: 'Get an inspection',
        security: secured,
        parameters: [idParameter],
        responses: { 200: inspectionResponse('The inspection'), 401: UNAUTHORIZED, 404: NOT_FOUND }
      },
      put: {
        tags: ['Inspections'],
        summary: 'Update an inspection',
        description:
          'Replaces the editable fields. The register is asked only when the project or system changes. '
          + 'clientId, capturedAt and the inspector cannot be changed.',
        security: secured,
        parameters: [idParameter],
        requestBody: inspectionBody,
        responses: {
          200: inspectionResponse('Updated'),
          400: INVALID,
          401: UNAUTHORIZED,
          403: FORBIDDEN,
          404: NOT_FOUND,
          422: REJECTED,
          503: REGISTER_DOWN
        }
      },
      delete: {
        tags: ['Inspections'],
        summary: 'Delete an inspection (admin only)',
        security: secured,
        parameters: [idParameter],
        responses: { 204: { description: 'Deleted' }, 401: UNAUTHORIZED, 403: FORBIDDEN, 404: NOT_FOUND }
      }
    },
    '/api/inspections/{id}/photos': {
      post: {
        tags: ['Inspections'],
        summary: 'Upload photos (JPEG, PNG or WebP; 10 MB each; five per request)',
        security: secured,
        parameters: [idParameter],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: { photos: { type: 'array', items: { type: 'string', format: 'binary' } } }
              }
            }
          }
        },
        responses: {
          200: inspectionResponse('The inspection with the new photos'),
          400: INVALID,
          401: UNAUTHORIZED,
          403: FORBIDDEN,
          404: NOT_FOUND
        }
      }
    },
    '/api/inspections/{id}/photos/{photoIndex}': {
      delete: {
        tags: ['Inspections'],
        summary: 'Remove a photo by its position in the photos list',
        security: secured,
        parameters: [
          idParameter,
          { in: 'path', name: 'photoIndex', required: true, schema: { type: 'integer', minimum: 0 } }
        ],
        responses: {
          200: inspectionResponse('The inspection without the photo'),
          400: INVALID,
          401: UNAUTHORIZED,
          403: FORBIDDEN,
          404: NOT_FOUND
        }
      }
    },
    '/api/inspections/{id}/ai-summary': {
      post: {
        tags: ['Inspections'],
        summary: 'Request an AI-assisted draft',
        description:
          'The draft is a suggestion that a qualified person must review. It never changes the record status '
          + 'and is not a compliance decision.',
        security: secured,
        parameters: [idParameter],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { instruction: { type: 'string', maxLength: 2000 } } }
            }
          }
        },
        responses: {
          200: {
            description: 'The draft and the updated inspection',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    summary: { type: 'string' },
                    source: { type: 'string', enum: ['mock', 'provider'] },
                    requiresReview: { type: 'boolean', enum: [true] },
                    inspection: { $ref: '#/components/schemas/Inspection' }
                  }
                }
              }
            }
          },
          400: INVALID,
          401: UNAUTHORIZED,
          403: FORBIDDEN,
          404: NOT_FOUND,
          502: errorResponse('The AI provider failed; the record is kept with aiStatus FAILED')
        }
      }
    }
  },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: { type: 'object', properties: { error: { type: 'string' } } },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          role: { type: 'string', enum: ['ADMIN', 'INSPECTOR', 'VIEWER'] }
        }
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } }
      },
      LoginResponse: {
        type: 'object',
        properties: { token: { type: 'string' }, user: { $ref: '#/components/schemas/User' } }
      },
      Observation: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          description: { type: 'string', maxLength: 1000 },
          severity: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH'] },
          remedialAction: { type: 'string', maxLength: 1000 }
        }
      },
      SystemSnapshot: {
        type: 'object',
        description: 'The firestop system as it was in the register when the record was stored',
        properties: {
          code: { type: 'string' },
          substrate: { type: 'string' },
          serviceType: { type: 'string' },
          fireRating: { type: 'string' },
          materials: { type: 'string' },
          installationMethod: { type: 'string' }
        }
      },
      InspectionInput: {
        type: 'object',
        required: ['projectId', 'systemId', 'location'],
        properties: {
          projectId: { type: 'string', format: 'uuid' },
          systemId: { type: 'string', format: 'uuid' },
          areaId: {
            type: 'string', format: 'uuid', nullable: true,
            description: 'An active area of the project. Left out or null, the record has no area'
          },
          location: { type: 'string', maxLength: 200 },
          notes: { type: 'string', maxLength: 5000 },
          status: { type: 'string', enum: ['DRAFT', 'IN_PROGRESS', 'ACTION_REQUIRED', 'COMPLETED'] },
          observations: { type: 'array', items: { $ref: '#/components/schemas/Observation' } },
          clientId: { type: 'string', format: 'uuid', description: 'Create only' },
          capturedAt: { type: 'string', format: 'date-time', description: 'Create only; defaults to now' }
        }
      },
      Inspection: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          clientId: { type: 'string', format: 'uuid', nullable: true },
          projectId: { type: 'string', format: 'uuid' },
          projectName: { type: 'string' },
          systemId: { type: 'string', format: 'uuid' },
          system: { $ref: '#/components/schemas/SystemSnapshot' },
          areaId: { type: 'string', format: 'uuid', nullable: true },
          areaName: { type: 'string', nullable: true, description: 'Copied from the register when the area was set' },
          location: { type: 'string' },
          notes: { type: 'string' },
          status: { type: 'string', enum: ['DRAFT', 'IN_PROGRESS', 'ACTION_REQUIRED', 'COMPLETED'] },
          inspectorId: { type: 'string' },
          inspectorName: { type: 'string' },
          observations: { type: 'array', items: { $ref: '#/components/schemas/Observation' } },
          photos: { type: 'array', items: { type: 'string' } },
          aiInstruction: { type: 'string', nullable: true },
          aiSummary: { type: 'string', nullable: true },
          aiStatus: { type: 'string', enum: ['NONE', 'DONE', 'FAILED'] },
          capturedAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' }
        }
      }
    }
  }
} as const;
