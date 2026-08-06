export type UserAccountStatus = 'REGISTERED' | 'ACTIVE' | 'DISABLED';

export class UserAccount {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly displayName: string,
    public readonly passwordHash: string,
    public readonly status: UserAccountStatus,
    public readonly lastLoginAt: Date | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  isActive(): boolean {
    return this.status === 'ACTIVE';
  }
}
