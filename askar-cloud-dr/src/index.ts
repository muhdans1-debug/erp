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
    const expectedSecret = env.DR_SECRET || 'askar-dr-secret-2026';
    const providedSecret = request.headers.get('x-dr-secret');
    if (providedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid or missing x-dr-secret' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const db = createClient({
      url: env.TURSO_URL || 'libsql://askar-supermarket-fleet.turso.io',
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
          const total = Number(sale.total || sale.totalAmount || 0);
          const timestamp = sale.timestamp || sale.createdAt || new Date().toISOString();
          const saleId = sale.id || invoiceNo;

          await db.execute({
            sql: `INSERT OR REPLACE INTO Sale (
              id, tenantId, invoiceNo, subtotal, total, totalAmount, paymentType, status, syncStatus, createdAt
            ) VALUES (?, 'tenant_1', ?, ?, ?, ?, ?, 'CLOUD_SYNCED', 'SYNCED', ?)`,
            args: [
              saleId,
              invoiceNo,
              Number(sale.subtotal || total),
              total,
              total,
              sale.paymentType || 'CASH',
              timestamp
            ]
          });

          // Process line items and decrement physical inventory
          let items: any[] = [];
          if (Array.isArray(sale.items)) {
            items = sale.items;
          } else if (typeof sale.items === 'string') {
            try {
              items = JSON.parse(sale.items);
            } catch {
              items = [];
            }
          }

          for (const item of items) {
            const itemId = item.id || `item_${saleId}_${item.productId || Math.random().toString(36).slice(2, 8)}`;
            const productId = item.productId || item.product_id;
            const qty = Number(item.quantity ?? item.qty ?? 1);
            const price = Number(item.priceAtSale ?? item.price ?? 0);
            const itemTotal = Number(item.total_price ?? item.total ?? (price * qty));

            if (productId) {
              await db.execute({
                sql: `INSERT OR REPLACE INTO SaleItem (
                  id, tenantId, saleId, productId, quantity, priceAtSale, total_price
                ) VALUES (?, 'tenant_1', ?, ?, ?, ?, ?)`,
                args: [
                  itemId,
                  saleId,
                  productId,
                  qty,
                  price,
                  itemTotal
                ]
              });

              // Decrement physical stock in master Turso database
              await db.execute({
                sql: `UPDATE Product 
                      SET stockQuantity = MAX(0, COALESCE(stockQuantity, 0) - ?),
                          updatedAt = ?
                      WHERE id = ?`,
                args: [qty, timestamp, productId]
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

