import type { Request } from 'express';

export type UserRole = 'trainee' | 'mentor' | 'manager';

export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
  };
}
