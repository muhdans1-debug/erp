// Secured Database Proxy for Askar Admin Dashboard
// Routes queries to the Fastify backend without exposing cloud credentials in client bundles

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
const DEV_SECRET = import.meta.env.VITE_DEV_SECRET || '';

export const adminDb = {
  async execute(stmt) {
    const payload = typeof stmt === 'string' ? { sql: stmt } : stmt;
    const res = await fetch(`${BACKEND_URL}/api/db/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dev-secret': DEV_SECRET
      },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || 'Failed to execute database query');
    }

    const data = await res.json();
    return {
      rows: data.rows || [],
      columns: data.columns || [],
      rowsAffected: data.rowsAffected || 0
    };
  }
};

export const db = adminDb;
export default adminDb;
