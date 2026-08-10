import { Redis } from "@upstash/redis";
import type {
  AuthorizationCodeRecord,
  OAuthClientRecord,
  OAuthStore,
  RefreshTokenRecord,
} from "./types";

interface MemoryEntry<T> {
  value: T;
  expiresAt: number;
}

export class MemoryOAuthStore implements OAuthStore {
  private readonly values = new Map<string, MemoryEntry<unknown>>();
  private readonly counters = new Map<string, { count: number; expiresAt: number }>();

  private put<T>(key: string, value: T, ttlSeconds: number) {
    this.values.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  private get<T>(key: string, consume = false): T | null {
    const entry = this.values.get(key);
    if (!entry || entry.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    if (consume) this.values.delete(key);
    return entry.value as T;
  }

  async putClient(client: OAuthClientRecord, ttlSeconds: number) {
    this.put(`client:${client.clientId}`, client, ttlSeconds);
  }
  async getClient(clientId: string) {
    return this.get<OAuthClientRecord>(`client:${clientId}`);
  }
  async putAuthorizationCode(codeHash: string, record: AuthorizationCodeRecord, ttlSeconds: number) {
    this.put(`code:${codeHash}`, record, ttlSeconds);
  }
  async consumeAuthorizationCode(codeHash: string) {
    return this.get<AuthorizationCodeRecord>(`code:${codeHash}`, true);
  }
  async putRefreshToken(tokenHash: string, record: RefreshTokenRecord, ttlSeconds: number) {
    this.put(`refresh:${tokenHash}`, record, ttlSeconds);
  }
  async consumeRefreshToken(tokenHash: string) {
    return this.get<RefreshTokenRecord>(`refresh:${tokenHash}`, true);
  }
  async deleteRefreshToken(tokenHash: string) {
    this.values.delete(`refresh:${tokenHash}`);
  }
  async allowRequest(key: string, limit: number, windowSeconds: number) {
    const current = this.counters.get(key);
    if (!current || current.expiresAt <= Date.now()) {
      this.counters.set(key, { count: 1, expiresAt: Date.now() + windowSeconds * 1000 });
      return true;
    }
    current.count += 1;
    return current.count <= limit;
  }
}

export class RedisOAuthStore implements OAuthStore {
  constructor(private readonly redis: Redis) {}

  private async put<T>(key: string, value: T, ttlSeconds: number) {
    await this.redis.set(`gsc-mcp:${key}`, value, { ex: ttlSeconds });
  }

  private async get<T>(key: string): Promise<T | null> {
    return (await this.redis.get<T>(`gsc-mcp:${key}`)) ?? null;
  }

  private async consume<T>(key: string): Promise<T | null> {
    const namespaced = `gsc-mcp:${key}`;
    const result = await this.redis.eval(
      "local v = redis.call('GET', KEYS[1]); if v then redis.call('DEL', KEYS[1]); end; return v",
      [namespaced],
      [],
    );
    if (typeof result !== "string") return null;
    return JSON.parse(result) as T;
  }

  async putClient(client: OAuthClientRecord, ttlSeconds: number) {
    await this.put(`client:${client.clientId}`, client, ttlSeconds);
  }
  async getClient(clientId: string) {
    return this.get<OAuthClientRecord>(`client:${clientId}`);
  }
  async putAuthorizationCode(codeHash: string, record: AuthorizationCodeRecord, ttlSeconds: number) {
    await this.put(`code:${codeHash}`, record, ttlSeconds);
  }
  async consumeAuthorizationCode(codeHash: string) {
    return this.consume<AuthorizationCodeRecord>(`code:${codeHash}`);
  }
  async putRefreshToken(tokenHash: string, record: RefreshTokenRecord, ttlSeconds: number) {
    await this.put(`refresh:${tokenHash}`, record, ttlSeconds);
  }
  async consumeRefreshToken(tokenHash: string) {
    return this.consume<RefreshTokenRecord>(`refresh:${tokenHash}`);
  }
  async deleteRefreshToken(tokenHash: string) {
    await this.redis.del(`gsc-mcp:refresh:${tokenHash}`);
  }
  async allowRequest(key: string, limit: number, windowSeconds: number) {
    const namespaced = `gsc-mcp:rate:${key}`;
    const result = await this.redis.eval(
      "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]); end; return n",
      [namespaced],
      [windowSeconds],
    );
    return Number(result) <= limit;
  }
}

let sharedStore: OAuthStore | undefined;

export function oauthStore(): OAuthStore {
  if (sharedStore) return sharedStore;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    sharedStore = new RedisOAuthStore(new Redis({ url, token }));
    return sharedStore;
  }
  if (process.env.NODE_ENV === "test" || process.env.ALLOW_IN_MEMORY_OAUTH === "true") {
    sharedStore = new MemoryOAuthStore();
    return sharedStore;
  }
  throw new Error("Required server configuration is missing: persistent OAuth store");
}

export function setOAuthStoreForTests(store?: OAuthStore) {
  sharedStore = store;
}
