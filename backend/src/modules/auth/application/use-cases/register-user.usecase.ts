import { Inject, Injectable } from '@nestjs/common';
import { ConflictException } from '../../../../common/exceptions/conflict.exception.js';
import { SystemRole } from '../../domain/value-objects/system-role.enum.js';
import { AuthRepository } from '../../domain/ports/auth.repository.js';
import { AuditPort } from '../../domain/ports/audit.port.js';
import { PasswordHasherPort } from '../../domain/ports/password-hasher.port.js';
import type { UserProfile } from '../../domain/entities/refresh-token-record.entity.js';
import { buildProfile, normalizeEmail } from '../user-profile.mapper.js';

export interface RegisterUserInput {
  email: string;
  password: string;
  displayName: string;
}

@Injectable()
export class RegisterUserUseCase {
  constructor(
    @Inject(AuthRepository) private readonly authRepository: AuthRepository,
    @Inject(PasswordHasherPort) private readonly hasher: PasswordHasherPort,
    @Inject(AuditPort) private readonly audit: AuditPort,
  ) {}

  async execute(input: RegisterUserInput): Promise<UserProfile> {
    const email = normalizeEmail(input.email);

    const existing = await this.authRepository.findByEmail(email);
    if (existing !== null) {
      throw new ConflictException('A user with this email already exists', { field: 'email' });
    }

    const passwordHash = await this.hasher.hash(input.password);
    const user = await this.authRepository.createUserWithRole({
      email,
      displayName: input.displayName,
      passwordHash,
      defaultRoleCode: SystemRole.GUEST,
    });

    const roles = await this.authRepository.findSystemRoles(user.id);
    this.audit.record({ code: 'auth.register.success', userId: user.id });

    return buildProfile(user, roles);
  }
}
