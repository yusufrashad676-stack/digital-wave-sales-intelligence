export interface AuthPrincipal {
  userId: string;
  roles: string[];
  tokenType: 'access' | 'refresh';
}
