import { createClient } from '@libsql/client/web';

export interface Env {
  TURSO_URL: string;
  TURSO_AUTH_TOKEN?: string;
  DR_SECRET?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. CORS Preflight Support
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, x-dr-secret',
        },
      });
    }

    // 2. Secure Endpoint: Validate DR Secret
    const expectedSecret = env.DR_SECRET;
    if (!expectedSecret) {
      return new Response(JSON.stringify({ error: 'Server configuration error: DR_SECRET not configured.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const providedSecret = request.headers.get('x-dr-secret');
    if (!providedSecret || providedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or missing x-dr-secret' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    if (!env.TURSO_URL || !env.TURSO_AUTH_TOKEN) {
      return new Response(JSON.stringify({ error: 'Server configuration error: Turso credentials missing.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const db = createClient({
      url: env.TURSO_URL,
      authToken: env.TURSO_AUTH_TOKEN
    });

    // 3. Health Ping
    if (request.method === 'GET' && (url.pathname === '/health' || url.pathname === '/api/health')) {
      return new Response(JSON.stringify({ status: 'ok', service: 'Askar-Emergency-DR-API' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 4. Emergency Sale Sync Route
    if (request.method === 'POST' && (url.pathname === '/api/sales/sync' || url.pathname === '/api/sync/sales')) {
      try {
        const incoming = await request.json() as any;
        const sales = Array.isArray(incoming) ? incoming : (incoming?.sales || [incoming]);

        for (const sale of sales) {
          const invoiceNo = sale.invoiceNo || sale.invoice_number || `INV-DR-${Date.now()}`;
          const saleId = sale.id || invoiceNo;
          const timestamp = sale.timestamp || sale.createdAt || new Date().toISOString();

          const tenantId = sale.tenantId || 'askar_main';

          // 1. Insert Sale Header (Using the schema-compliant query we patched earlier)
          await db.execute({
            sql: `INSERT OR REPLACE INTO Sale (
              id, tenantId, invoiceNo, subtotal, total, totalAmount, paymentType, status, syncStatus, createdAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'CLOUD_SYNCED', 'SYNCED', ?)`,
            args: [
              saleId, tenantId, invoiceNo, Number(sale.subtotal || sale.total), Number(sale.total || sale.totalAmount || 0), Number(sale.total || sale.totalAmount || 0), sale.paymentType || 'CASH', timestamp
            ]
          });

          // NEW: 2. Safely Process Line Items & Update Turso Inventory
          const items = Array.isArray(sale.items) 
            ? sale.items 
            : (typeof sale.items === 'string' ? (() => { try { return JSON.parse(sale.items); } catch { return []; } })() : []);

          for (const item of items) {
            const itemId = item.id || `si_${crypto.randomUUID().slice(0, 8)}`;
            const pid = item.productId || item.id;
            const qty = Number(item.quantity || item.qty || 1);
            const price = Number(item.priceAtSale || item.price || 0);

            // Persist the line item
            await db.execute({
              sql: `INSERT OR REPLACE INTO SaleItem (id, tenantId, saleId, productId, quantity, priceAtSale, total_price)
                    VALUES (?, ?, ?, ?, ?, ?, ?)`,
              args: [itemId, tenantId, saleId, pid, qty, price, price * qty]
            });

            // Deduct the stock quantity globally
            if (pid) {
              await db.execute({
                sql: `UPDATE Product SET stockQuantity = MAX(0, stockQuantity - ?), updatedAt = ? WHERE id = ?`,
                args: [qty, timestamp, pid]
              });
            }
          }
        }

        return new Response(JSON.stringify({ success: true, processed: sales.length }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      } catch (e: any) {
        return new Response(JSON.stringify({ error: e.message || 'DR Cloud Sync Failed' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Endpoint Not Found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};

