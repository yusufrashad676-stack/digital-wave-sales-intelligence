export class TokenPair {
  constructor(
    public readonly accessToken: string,
    public readonly refreshToken: string,
    public readonly tokenType: string,
    public readonly expiresIn: number,
  ) {}
}
