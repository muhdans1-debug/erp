import { Hono } from 'hono';
import { getDb, type Env } from '../db.ts';
import { requireManagerAuth } from '../middleware/auth.ts';
import type { TenantContext } from '../middleware/tenant.ts';

export const imagesRouter = new Hono<{ Bindings: Env; Variables: TenantContext }>();

// 1. Public High-Speed Edge Delivery Endpoint for Produce / Product Images
imagesRouter.get('/:key', async (c) => {
  const bucket = c.env.PRODUCE_BUCKET;
  const key = c.req.param('key');

  if (!bucket) {
    return c.json({ error: 'R2 storage bucket is not configured on this edge instance.' }, 503);
  }

  const object = await bucket.get(key);
  if (!object) {
    return c.json({ error: 'Image not found' }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  // Guarantee long-lived edge caching for immutable assets
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  
  if (!headers.get('Content-Type')) {
    if (key.endsWith('.webp')) {
      headers.set('Content-Type', 'image/webp');
    } else if (key.endsWith('.png')) {
      headers.set('Content-Type', 'image/png');
    } else {
      headers.set('Content-Type', 'image/jpeg');
    }
  }

  return c.body(object.body, 200, Object.fromEntries(headers.entries()));
});

// 2. Dual-Asset Upload Endpoint: Master HD JPEG + Micro 80x80 WebP
imagesRouter.post('/upload', requireManagerAuth, async (c) => {
  const bucket = c.env.PRODUCE_BUCKET;
  if (!bucket) {
    return c.json({ error: 'R2 storage bucket is not configured on this edge instance.' }, 503);
  }

  try {
    const contentType = c.req.header('content-type') || '';
    let barcode = '';
    let productId = '';
    let masterBuffer: ArrayBuffer | null = null;
    let thumbBuffer: ArrayBuffer | null = null;

    if (contentType.includes('application/json')) {
      const body = await c.req.json();
      barcode = String(body.barcode || body.productId || '').trim();
      productId = String(body.productId || body.id || barcode).trim();

      if (body.masterBase64) {
        const cleanBase64 = body.masterBase64.replace(/^data:image\/[a-zA-Z0-9]+;base64,/, '');
        const binary = atob(cleanBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        masterBuffer = bytes.buffer;
      }

      if (body.thumbBase64) {
        const cleanBase64 = body.thumbBase64.replace(/^data:image\/[a-zA-Z0-9]+;base64,/, '');
        const binary = atob(cleanBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        thumbBuffer = bytes.buffer;
      }
    } else if (contentType.includes('multipart/form-data')) {
      const form = await c.req.formData();
      barcode = String(form.get('barcode') || form.get('productId') || '').trim();
      productId = String(form.get('productId') || form.get('id') || barcode).trim();

      const masterFile = form.get('master') as File | null;
      if (masterFile) {
        masterBuffer = await masterFile.arrayBuffer();
      }

      const thumbFile = form.get('thumb') as File | null;
      if (thumbFile) {
        thumbBuffer = await thumbFile.arrayBuffer();
      }
    }

    if (!barcode && !productId) {
      return c.json({ error: 'Barcode or Product ID is required' }, 400);
    }

    if (!masterBuffer && !thumbBuffer) {
      return c.json({ error: 'No image data provided for upload' }, 400);
    }

    const cleanCode = (barcode || productId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'item';
    const timestamp = Date.now();

    let fullKey: string | null = null;
    let thumbKey: string | null = null;
    const workerOrigin = new URL(c.req.url).origin;

    // 1. Store Master Full-Res JPEG
    if (masterBuffer) {
      fullKey = `prod_${cleanCode}_${timestamp}_full.jpg`;
      await bucket.put(fullKey, masterBuffer, {
        httpMetadata: { contentType: 'image/jpeg' },
        customMetadata: { barcode: cleanCode, type: 'master' }
      });
    }

    // 2. Store Micro 80x80 WebP Thumbnail for Sunmi POS
    if (thumbBuffer) {
      thumbKey = `prod_${cleanCode}_${timestamp}_thumb.webp`;
      await bucket.put(thumbKey, thumbBuffer, {
        httpMetadata: { contentType: 'image/webp' },
        customMetadata: { barcode: cleanCode, type: 'thumb_80x80' }
      });
    }

    const fullUrl = fullKey ? `${workerOrigin}/images/${fullKey}` : null;
    const thumbUrl = thumbKey ? `${workerOrigin}/images/${thumbKey}` : null;

    // 3. Update Database in Turso Cloud
    const db = getDb(c.env);
    const sets: string[] = ['updatedAt = CURRENT_TIMESTAMP'];
    const args: (string | null)[] = [];

    if (fullUrl) {
      sets.push('image_url = ?');
      args.push(fullUrl);
    }
    if (thumbUrl) {
      sets.push('image_url_thumb = ?');
      args.push(thumbUrl);
    }

    args.push(cleanCode, cleanCode);
    await db.execute({
      sql: `UPDATE Product SET ${sets.join(', ')} WHERE barcode = ? OR id = ?`,
      args
    });

    return c.json({
      success: true,
      imageUrl: fullUrl,
      imageUrlThumb: thumbUrl,
      fullKey,
      thumbKey
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to process and store dual-asset image', details: err?.message }, 500);
  }
});
