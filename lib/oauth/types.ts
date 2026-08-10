export type TokenEndpointAuthMethod = "none" | "client_secret_basic" | "client_secret_post";

export interface OAuthClientRecord {
  clientId: string;
  clientSecretHash?: string;
  clientName?: string;
  redirectUris: string[];
  tokenEndpointAuthMethod: TokenEndpointAuthMethod;
  createdAt: number;
}

export interface AuthorizationCodeRecord {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  subject: string;
  resource: string;
}

export interface RefreshTokenRecord {
  clientId: string;
  scopes: string[];
  subject: string;
  resource: string;
}

export interface OAuthStore {
  putClient(client: OAuthClientRecord, ttlSeconds?: number): Promise<void>;
  getClient(clientId: string): Promise<OAuthClientRecord | null>;
  putAuthorizationCode(codeHash: string, record: AuthorizationCodeRecord, ttlSeconds: number): Promise<void>;
  consumeAuthorizationCode(codeHash: string): Promise<AuthorizationCodeRecord | null>;
  putRefreshToken(tokenHash: string, record: RefreshTokenRecord, ttlSeconds: number): Promise<void>;
  consumeRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null>;
  deleteRefreshToken(tokenHash: string): Promise<void>;
  allowRequest(key: string, limit: number, windowSeconds: number): Promise<boolean>;
}
