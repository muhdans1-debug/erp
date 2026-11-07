// Deprecated Database Proxy for Askar Admin Dashboard
// Raw SQL execution over network is disabled for zero-trust security.
// Use structured REST endpoints (/api/customers, /api/products, etc.)

export const adminDb = {
  async execute() {
    console.warn('⚠️ [adminDb.execute] Deprecated: Raw SQL over network has been disabled for security. Use structured REST endpoints.');
    return {
      rows: [],
      columns: [],
      rowsAffected: 0
    };
  }
};

export const db = adminDb;
export default adminDb;
