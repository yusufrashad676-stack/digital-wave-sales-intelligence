export const TokenPort = Symbol('TokenPort');

export interface AccessTokenClaims {
  sub: string;
  roles: string[];
  type: 'access';
}

export interface RefreshTokenClaims {
  sub: string;
  familyId: string;
  type: 'refresh';
}

export interface SignedRefreshToken {
  token: string;
  jti: string;
}

export interface TokenPort {
  signAccessToken(claims: AccessTokenClaims): Promise<string>;
  signRefreshToken(claims: RefreshTokenClaims): Promise<SignedRefreshToken>;
  verifyAccessToken(token: string): Promise<AccessTokenClaims>;
  verifyRefreshToken(token: string): Promise<RefreshTokenClaims>;
  hashRefreshToken(token: string): string;
  generateFamilyId(): string;
  accessTokenTtlSeconds(): number;
  refreshTokenTtlSeconds(): number;
}
