import { Injectable } from '@nestjs/common';
import { argon2id, hash as argon2Hash, verify as argon2Verify } from 'argon2';
import type { PasswordHasherPort } from '../../domain/ports/password-hasher.port.js';

@Injectable()
export class Argon2PasswordHasher implements PasswordHasherPort {
  hash(password: string): Promise<string> {
    return argon2Hash(password, { type: argon2id });
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await argon2Verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
