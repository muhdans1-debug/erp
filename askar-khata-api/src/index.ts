import { createClient } from '@libsql/client/web';

export interface Env {
  TURSO_URL: string;
  TURSO_AUTH_TOKEN?: string;
  TURSO_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1. Support CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'x-khata-pin, Content-Type',
        },
      });
    }

    // 2. Secured Edge Customer Khata Route
    if (request.method === 'GET' && url.pathname.startsWith('/api/khata/')) {
      const customerId = (url.pathname.split('/').pop() || '').trim();
      const providedPin = request.headers.get('x-khata-pin')?.trim();

      // 1. Block missing PINs at the edge
      if (!providedPin) {
        return new Response(JSON.stringify({ error: 'Unauthorized: PIN required.' }), {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      const TURSO_FALLBACK_URL = "libsql://askar-pos-primary-muhdans1.aws-ap-south-1.turso.io";
      const TURSO_FALLBACK_TOKEN = "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTM5MDgyNDAsImlkIjoiMDFhMTg0YjgtMjIwMS03YzJhLThlY2EtZDVkNDcyZjkxZGRlIiwia2lkIjoiQ0cxaFB3c3d5VWgwUlE5dzNZRDZRRmxuYk9rWUNCYklfVWJkSEhXS1hNNCIsInJpZCI6Ijk3MzEwYzA5LTMxYjUtNDNkNi1hY2ViLWNmYWY1MTIzZDRkNSJ9.U5P8GYK31KnUbgtrdvNKwau-ARB17g-Zk3PFBkz_Olu3DV5QQaFFTwbylLPV_LZMDwzwwJr-2lOelcD3IWyjAg";

      // Initialize Turso Client securely with worker environment variables
      const targetUrl = env.TURSO_URL || TURSO_FALLBACK_URL;
      const authToken = env.TURSO_AUTH_TOKEN || env.TURSO_TOKEN || TURSO_FALLBACK_TOKEN;

      let turso = createClient({
        url: targetUrl,
        authToken: authToken,
      });

      try {
        // 2. Securely verify the PIN against the database
        const authCheck = await turso.execute({
          sql: `SELECT id, name, balance, phone, cpr, pin, khata_pin, access_token 
                FROM Customer 
                WHERE (id = ? OR access_token = ?) 
                  AND (pin = ? OR khata_pin = ?)
                LIMIT 1`,
          args: [customerId, customerId, providedPin, providedPin],
        });

        if (authCheck.rows.length === 0) {
          return new Response(JSON.stringify({ error: 'Forbidden: Invalid Khata PIN.' }), {
            status: 403,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }

        const customer = authCheck.rows[0];
        const actualCustomerId = String(customer.id);

        // 3. PIN is valid, proceed to fetch and return the financial ledger
        const ledgerQuery = await turso.execute({
          sql: `SELECT id, customerId, amount, type, reference, running_balance, timestamp, created_at 
                FROM KhataLedger 
                WHERE customerId = ? 
                ORDER BY timestamp DESC LIMIT 50`,
          args: [actualCustomerId],
        });

        const responsePayload = {
          success: true,
          id: actualCustomerId,
          name: customer.name,
          balance: customer.balance ?? 0,
          phone: customer.phone,
          cpr: customer.cpr,
          ledger: ledgerQuery.rows || [],
        };

        return new Response(JSON.stringify(responsePayload), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (error: any) {
        return new Response(JSON.stringify({ error: 'Edge Database Error', details: error?.message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};
