import type { UserAccount } from '../domain/entities/user-account.entity.js';
import { UserProfile } from '../domain/entities/refresh-token-record.entity.js';

export function buildProfile(user: UserAccount, roles: string[]): UserProfile {
  return new UserProfile(user.id, user.email, user.displayName, user.status, roles, user.lastLoginAt, user.createdAt);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
