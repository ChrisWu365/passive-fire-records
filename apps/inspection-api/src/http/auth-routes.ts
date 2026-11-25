import { Router } from 'express';
import { issueToken, requireAuth, type AuthenticatedRequest } from '../auth.js';
import { findUser, verifyPassword } from '../users/demo-users.js';

const UNAUTHORIZED = 401;

/** Sign-in and "who am I". Mounted under /api. */
export function createAuthRoutes(): Router {
  const router = Router();

  router.post('/auth/login', async (request, response) => {
    const email = typeof request.body?.email === 'string' ? request.body.email.trim().toLowerCase() : '';
    const password = typeof request.body?.password === 'string' ? request.body.password : '';
    const user = findUser(email);
    // One message for both failures, so the response does not reveal which emails have accounts.
    if (!user || !(await verifyPassword(user, password))) {
      response.status(UNAUTHORIZED).json({ error: 'Invalid email or password' });
      return;
    }
    response.json({
      token: issueToken(user),
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  });

  router.get('/me', requireAuth, (request: AuthenticatedRequest, response) => {
    response.json(request.user);
  });

  return router;
}
