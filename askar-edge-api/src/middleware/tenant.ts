import type { Context, Next } from 'hono';
import type { Env } from '../db.ts';

export interface TenantContext {
  tenantId: string;
  storeId: string;
  terminalId: string;
}

const SLUG_REGEX = /^[a-zA-Z0-9_-]{1,32}$/;

export async function tenantMiddleware(c: Context<{ Bindings: Env; Variables: TenantContext }>, next: Next) {
  const env = c.env;

  // 1. Resolve and sanitize Tenant ID (Header -> Query -> Default)
  const rawTenant = c.req.header('x-tenant-id')?.trim() || c.req.query('tenantId')?.trim();
  let tenantId = env.DEFAULT_TENANT_ID || 'tenant_askar_01';
  if (rawTenant) {
    if (!SLUG_REGEX.test(rawTenant)) {
      return c.json({ error: 'Invalid x-tenant-id format. Must be 1-32 alphanumeric characters, dashes, or underscores.' }, 400);
    }
    tenantId = rawTenant;
  }

  // 2. Resolve and sanitize Store / Branch ID
  const rawStore = c.req.header('x-store-id')?.trim() || c.req.query('storeId')?.trim();
  let storeId = env.DEFAULT_STORE_ID || 'store_askar_01';
  if (rawStore) {
    if (!SLUG_REGEX.test(rawStore)) {
      return c.json({ error: 'Invalid x-store-id format. Must be 1-32 alphanumeric characters, dashes, or underscores.' }, 400);
    }
    storeId = rawStore;
  }

  // 3. Resolve and sanitize Terminal / Register ID
  const rawTerminal =
    c.req.header('x-terminal-id')?.trim() ||
    c.req.header('x-register-id')?.trim() ||
    c.req.query('terminalId')?.trim();
  let terminalId = 'R01';
  if (rawTerminal) {
    if (!SLUG_REGEX.test(rawTerminal)) {
      return c.json({ error: 'Invalid x-terminal-id format. Must be 1-32 alphanumeric characters, dashes, or underscores.' }, 400);
    }
    terminalId = rawTerminal;
  }

  c.set('tenantId', tenantId);
  c.set('storeId', storeId);
  c.set('terminalId', terminalId);

  await next();
}
