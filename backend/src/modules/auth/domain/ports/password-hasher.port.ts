export const PasswordHasherPort = Symbol('PasswordHasherPort');

export interface PasswordHasherPort {
  hash(password: string): Promise<string>;
  verify(passwordHash: string, password: string): Promise<boolean>;
}
