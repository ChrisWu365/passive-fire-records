import bcrypt from 'bcryptjs';
import type { User } from '../types.js';

const BCRYPT_ROUNDS = 10;

/**
 * Built-in accounts for demonstration. There is no user database: a real deployment would replace this
 * module with an identity provider.
 */
const DEMO_USERS: readonly User[] = [
  demoUser('user-admin', 'admin@example.com', 'Admin123!', 'Demo Admin', 'ADMIN'),
  demoUser('user-inspector', 'inspector@example.com', 'Inspector123!', 'Demo Inspector', 'INSPECTOR'),
  demoUser('user-viewer', 'viewer@example.com', 'Viewer123!', 'Demo Viewer', 'VIEWER')
];

function demoUser(id: string, email: string, password: string, name: string, role: User['role']): User {
  return { id, email, passwordHash: bcrypt.hashSync(password, BCRYPT_ROUNDS), name, role };
}

export function findUser(email: string): User | undefined {
  return DEMO_USERS.find((user) => user.email === email.toLowerCase());
}

export async function verifyPassword(user: User, password: string): Promise<boolean> {
  return bcrypt.compare(password, user.passwordHash);
}
