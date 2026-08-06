import type { UserAccount } from '../entities/user-account.entity.js';

export const AuthRepository = Symbol('AuthRepository');

export interface CreateUserInput {
  email: string;
  displayName: string;
  passwordHash: string;
  defaultRoleCode: string;
}

export interface AuthRepository {
  findByEmail(email: string): Promise<UserAccount | null>;
  findById(id: string): Promise<UserAccount | null>;
  createUserWithRole(input: CreateUserInput): Promise<UserAccount>;
  findSystemRoles(userId: string): Promise<string[]>;
  recordLogin(userId: string, at: Date): Promise<void>;
}
