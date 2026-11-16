import type { Context, Next } from 'hono';
import type { Env } from '../db.ts';

export interface TenantContext {
  tenantId: string;
  storeId: string;
  terminalId: string;
}

export async function tenantMiddleware(c: Context<{ Bindings: Env; Variables: TenantContext }>, next: Next) {
  const env = c.env;

  // 1. Resolve Tenant ID (Header -> Query -> Cookie -> Default)
  const tenantId =
    c.req.header('x-tenant-id')?.trim() ||
    c.req.query('tenantId')?.trim() ||
    env.DEFAULT_TENANT_ID ||
    'tenant_askar_01';

  // 2. Resolve Store / Branch ID
  const storeId =
    c.req.header('x-store-id')?.trim() ||
    c.req.query('storeId')?.trim() ||
    env.DEFAULT_STORE_ID ||
    'store_askar_01';

  // 3. Resolve Terminal / Register ID
  const terminalId =
    c.req.header('x-terminal-id')?.trim() ||
    c.req.header('x-register-id')?.trim() ||
    c.req.query('terminalId')?.trim() ||
    'R01';

  c.set('tenantId', tenantId);
  c.set('storeId', storeId);
  c.set('terminalId', terminalId);

  await next();
}
