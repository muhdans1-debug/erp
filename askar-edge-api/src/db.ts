import { createClient } from '@libsql/client/web';

export type DbClient = ReturnType<typeof createClient>;

export interface Env {
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
  ENVIRONMENT?: string;
  DEFAULT_TENANT_ID?: string;
  DEFAULT_STORE_ID?: string;
  MANAGER_PIN?: string;
  DEV_SECRET?: string;
  MANAGER_SECRET?: string;
  POS_AUTH_SECRET?: string;
  DR_SYNC_SECRET?: string;
  DEVICE_TOKEN_SECRET?: string;
  BENEFIT_WEBHOOK_SECRET?: string;
}

let cachedClient: DbClient | null = null;
let cachedToken: string | null = null;

/**
 * Creates or retrieves a cached lightweight HTTP LibSQL client tuned for Cloudflare Worker edge execution
 */
export function getDb(env: Env): DbClient {
  if (!env.TURSO_URL || !env.TURSO_AUTH_TOKEN) {
    throw new Error('TURSO_URL and TURSO_AUTH_TOKEN must be configured in environment bindings.');
  }

  if (cachedClient && cachedToken === env.TURSO_AUTH_TOKEN) {
    return cachedClient;
  }

  cachedToken = env.TURSO_AUTH_TOKEN;
  cachedClient = createClient({
    url: env.TURSO_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });

  return cachedClient;
}
