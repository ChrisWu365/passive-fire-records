export type Role = 'ADMIN' | 'INSPECTOR' | 'VIEWER';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: Role;
}
