export class RefreshTokenRecord {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly tokenHash: string,
    public readonly familyId: string,
    public readonly expiresAt: Date,
    public readonly revokedAt: Date | null,
    public readonly replacedByTokenId: string | null,
    public readonly createdAt: Date,
  ) {}

  isRevoked(): boolean {
    return this.revokedAt !== null;
  }

  isExpired(now: Date): boolean {
    return this.expiresAt.getTime() <= now.getTime();
  }
}

export class UserProfile {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly displayName: string,
    public readonly status: string,
    public readonly roles: string[],
    public readonly lastLoginAt: Date | null,
    public readonly createdAt: Date,
  ) {}
}
