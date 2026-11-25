import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import type { Role, User } from './types.js';
export type { Role, User };

// Local development fallback. The register service's local profile uses the same value, and it must stay at
// least 32 bytes long because the register service rejects shorter HS256 secrets.
const jwtSecret = process.env.JWT_SECRET ?? 'local-development-only-secret-do-not-deploy';

const BEARER_PREFIX = 'Bearer ';

/** The claims issueToken puts in a token; the user id travels in the standard "sub" claim. */
interface TokenPayload {
  sub: string;
  email: string;
  name: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user?: Pick<User, 'id' | 'email' | 'name' | 'role'>;
  /** The verified token as it was sent, for calls made to other services on the user's behalf. */
  bearerToken?: string;
}

export function issueToken(user: User): string {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    jwtSecret,
    { expiresIn: '8h' }
  );
}

export function requireAuth(request: AuthenticatedRequest, response: Response, next: NextFunction): void {
  const header = request.header('authorization');
  if (!header?.startsWith(BEARER_PREFIX)) {
    response.status(401).json({ error: 'Authentication required' });
    return;
  }
  try {
    const token = header.slice(BEARER_PREFIX.length);
    const payload = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] }) as TokenPayload;
    request.user = { id: payload.sub, email: payload.email, name: payload.name, role: payload.role };
    request.bearerToken = token;
    next();
  } catch {
    response.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireRole(...roles: Role[]) {
  return (request: AuthenticatedRequest, response: Response, next: NextFunction): void => {
    if (!request.user || !roles.includes(request.user.role)) {
      response.status(403).json({ error: 'Insufficient permissions' });
      return;
    }
    next();
  };
}
