import { createClient } from '@libsql/client/web';

export interface Env {
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Support CORS preflight requests
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    // Only respond to the specific Khata route
    if (url.pathname.startsWith('/api/khata/')) {
      // Extract the UUID from the URL (e.g., /api/khata/f8a9-4b2c)
      const uuid = url.pathname.split('/').pop() || '';

      // Connect to Turso using Cloudflare's secure environment variables
      const client = createClient({
        url: env.TURSO_URL,
        authToken: env.TURSO_AUTH_TOKEN,
      });

      try {
        // Query the unified Customer database securely
        const result = await client.execute({
          sql: 'SELECT name, balance, phone FROM Customer WHERE access_token = ? OR id = ?',
          args: [uuid, uuid]
        });

        if (result.rows.length === 0) {
          return new Response(JSON.stringify({ error: "Account Not Found" }), {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }

        // Return the customer's balance to the React PWA
        return new Response(JSON.stringify(result.rows[0]), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*' // Allows your Vercel PWA to read it
          }
        });

      } catch (error) {
        return new Response("Database Error", { status: 500 });
      }
    }

    return new Response("Askar API is running.", { status: 200 });
  },
};
