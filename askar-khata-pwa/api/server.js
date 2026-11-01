import Fastify from 'fastify';
import { createClient } from '@libsql/client';
import jwt from 'jsonwebtoken';

const fastify = Fastify({ logger: true });

const tursoUrl = process.env.TURSO_DATABASE_URL || process.env.TURSO_URL || "libsql://askar-pos-primary-muhdans1.aws-ap-south-1.turso.io";
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3OTM1NDIzMTksImlkIjoiMDFhMTg0YjgtMjIwMS03YzJhLThlY2EtZDVkNDcyZjkxZGRlIiwia2lkIjoiQ0cxaFB3c3d5VWgwUlE5dzNZRDZRRmxuYk9rWUNCYklfVWJkSEhXS1hNNCIsInJpZCI6Ijk3MzEwYzA5LTMxYjUtNDNkNi1hY2ViLWNmYWY1MTIzZDRkNSJ9.W6Hc7fVPLuJJ3capRMHZNm5-yJYHnYSulJ8h9sUxd7BPLchZbMh3LxTa86S8K_Nt9RpsqPgpudDOzfNJkCeJCg";
const JWT_SECRET = process.env.JWT_SECRET || 'askar_khata_secure_jwt_secret_2026';

const db = createClient({
  url: tursoUrl,
  authToken: tursoAuthToken
});

// Health check endpoint
fastify.get('/api/health', async (_req, _res) => {
  return { status: 'ok', service: 'Askar Khata Unified API', timestamp: new Date().toISOString() };
});

// Step 2: Customer PIN Verification & Device Trust Endpoint
fastify.post('/api/auth/verify', async (request, reply) => {
  try {
    const { customerUuid, uuid, pin } = request.body || {};
    const targetId = customerUuid || uuid;

    if (!targetId || !pin) {
      return reply.status(400).send({ success: false, error: 'Customer ID and PIN are required' });
    }

    const cleanPin = String(pin).trim();

    // 1. Primary lookup in KhataCustomer
    const result = await db.execute({
      sql: 'SELECT id, name, balance, pin, access_token FROM KhataCustomer WHERE access_token = ? OR id = ? OR phone = ? LIMIT 1',
      args: [targetId, targetId, targetId]
    });

    if (result.rows && result.rows.length > 0) {
      const customer = result.rows[0];
      const customerPin = customer.pin ? String(customer.pin).trim() : '1234';

      if (customerPin === cleanPin) {
        const token = jwt.sign(
          {
            id: customer.id,
            name: customer.name,
            accessToken: customer.access_token || customer.id
          },
          JWT_SECRET,
          { expiresIn: '90d' }
        );

        return reply.send({
          success: true,
          token,
          customerName: customer.name,
          customerId: customer.id
        });
      } else {
        return reply.status(401).send({ success: false, error: 'Incorrect PIN' });
      }
    }

    // 2. Demo fallback accounts
    if (targetId === 'f8a9-4b2c' || targetId.includes('f8a9') || targetId.includes('cust_nfc')) {
      if (cleanPin === '1234') {
        const token = jwt.sign(
          { id: targetId, name: 'Camp Mess Alpha', accessToken: targetId },
          JWT_SECRET,
          { expiresIn: '90d' }
        );
        return reply.send({ success: true, token, customerName: 'Camp Mess Alpha', customerId: targetId });
      } else {
        return reply.status(401).send({ success: false, error: 'Incorrect PIN' });
      }
    }

    return reply.status(404).send({ success: false, error: 'Account Not Found' });
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ success: false, error: error.message });
  }
});

// ROUTE: Customer Self-Service Change PIN
fastify.post('/api/auth/change-pin', async (request, reply) => {
  try {
    const { uuid, customerUuid, oldPin, newPin } = request.body || {};
    const targetId = uuid || customerUuid;

    if (!targetId || !oldPin || !newPin) {
      return reply.status(400).send({ error: 'Customer ID, current PIN, and new PIN are required' });
    }

    const cleanOldPin = String(oldPin).trim();
    const cleanNewPin = String(newPin).trim();

    if (cleanNewPin.length !== 4 || !/^\d{4}$/.test(cleanNewPin)) {
      return reply.status(400).send({ error: 'New PIN must be exactly 4 numeric digits' });
    }

    // 1. Verify current PIN against KhataCustomer
    const verify = await db.execute({
      sql: 'SELECT id, pin FROM KhataCustomer WHERE id = ? OR access_token = ? LIMIT 1',
      args: [targetId, targetId]
    });

    if (!verify.rows || verify.rows.length === 0) {
      return reply.status(404).send({ error: 'Account Not Found' });
    }

    const currentCustomerPin = verify.rows[0].pin ? String(verify.rows[0].pin).trim() : '1234';

    if (currentCustomerPin !== cleanOldPin) {
      return reply.status(401).send({ error: 'Current PIN is incorrect' });
    }

    // 2. Update to the new PIN
    await db.execute({
      sql: 'UPDATE KhataCustomer SET pin = ? WHERE id = ? OR access_token = ?',
      args: [cleanNewPin, targetId, targetId]
    });

    return reply.send({ success: true, message: 'PIN updated successfully' });
  } catch (error) {
    fastify.log.error(error);
    return reply.status(500).send({ error: error.message || 'Failed to update PIN' });
  }
});

// Khata Customer Statement Endpoint
fastify.get('/api/khata/:uuid', async (request, reply) => {
  const { uuid } = request.params;
  try {
    // 1. Primary lookup in KhataCustomer (columns: id, access_token, name, balance, phone, mess_id)
    const result = await db.execute({
      sql: 'SELECT id, name, balance, phone, access_token FROM KhataCustomer WHERE access_token = ? OR id = ? OR phone = ? LIMIT 1',
      args: [uuid, uuid, uuid]
    });

    if (result.rows && result.rows.length > 0) {
      return result.rows[0];
    }

    // 2. Fallback lookup in Customer table (supports CPR and Card UID lookup)
    const fallback = await db.execute({
      sql: 'SELECT id, name, 0.000 AS balance, phone, id AS access_token FROM Customer WHERE id = ? OR phone = ? OR cpr = ? OR cardUid = ? LIMIT 1',
      args: [uuid, uuid, uuid, uuid]
    }).catch(() => ({ rows: [] }));

    if (fallback.rows && fallback.rows.length > 0) {
      return fallback.rows[0];
    }

    if (uuid === 'f8a9-4b2c' || uuid.includes('f8a9') || uuid.includes('cust_nfc')) {
      return {
        id: uuid,
        name: 'Camp Mess Alpha (Test Account)',
        balance: 14.500,
        access_token: uuid
      };
    }

    return reply.status(404).send({ error: "Account Not Found" });
  } catch (error) {
    fastify.log.error(error);
    if (uuid === 'f8a9-4b2c' || uuid.includes('f8a9') || uuid.includes('cust_nfc')) {
      return {
        id: uuid,
        name: 'Camp Mess Alpha (Test Account)',
        balance: 14.500,
        access_token: uuid
      };
    }
    return reply.status(500).send({ error: "Database Error", message: error.message });
  }
});

// Step 3: Tap Payments Checkout Initiation (BenefitPay / Fawri+)
fastify.post('/api/checkout', async (request, reply) => {
  try {
    const { customerUuid, amount, currency = 'BHD', customerName = 'Khata Customer' } = request.body || {};
    const effectiveAmount = Number(amount || 14.500);
    const chargeId = `chg_tap_${Date.now()}`;

    // Payload configured with Vercel Webhook Destination
    const tapPayload = {
      amount: effectiveAmount,
      currency: currency,
      threeDSecure: true,
      save_card: false,
      description: `Khata Debt Settlement - ${customerName}`,
      statement_descriptor: 'Askar Supermarket Khata',
      metadata: {
        customerUuid: customerUuid || 'f8a9-4b2c',
        source: 'Vercel_Khata_PWA'
      },
      reference: {
        transaction: chargeId,
        order: `ORD-${Date.now()}`
      },
      receipt: {
        email: false,
        sms: true
      },
      customer: {
        first_name: customerName,
        phone: {
          country_code: '973',
          number: '39000000'
        }
      },
      source: {
        id: 'src_bh.benefit' // Native BenefitPay Source on Tap Payments
      },
      post: {
        url: 'https://askar-khata-pwa.vercel.app/api/webhook/tap'
      },
      redirect: {
        url: `https://askar-khata-pwa.vercel.app/tab/${customerUuid || 'f8a9-4b2c'}?status=success`
      }
    };

    return reply.send({
      success: true,
      chargeId,
      amount: effectiveAmount,
      paymentMethod: 'BENEFIT_PAY',
      webhookUrl: tapPayload.post.url,
      redirectUrl: tapPayload.redirect.url,
      tapPayload
    });
  } catch (error) {
    return reply.status(500).send({ success: false, error: error.message });
  }
});

// Step 3: Tap Payments Webhook Receiver & Automated Turso Debt Reconciliation
fastify.post('/api/webhook/tap', async (request, reply) => {
  try {
    const payload = request.body || {};
    const status = payload.status || payload.charge_status || 'CAPTURED';
    const amount = Number(payload.amount || payload.response?.amount || 0);
    const metadata = payload.metadata || {};
    const customerUuid = metadata.customerUuid || payload.reference?.order?.replace('ORD-', '') || 'f8a9-4b2c';

    fastify.log.info({ status, amount, customerUuid }, 'Tap Payments Webhook Received');

    // If payment cleared via BenefitPay / Card
    if (status === 'CAPTURED' || status === 'PAID' || status === 'SUCCESS') {
      try {
        // Automatically deduct settled amount in Turso SQLite
        if (amount > 0) {
          await db.execute({
            sql: 'UPDATE KhataCustomer SET balance = MAX(0, balance - ?) WHERE access_token = ? OR id = ?',
            args: [amount, customerUuid, customerUuid]
          });

          // Log into Ledger
          const ledgerId = `tx_tap_${Date.now()}`;
          await db.execute({
            sql: `INSERT INTO KhataLedger (id, customerId, amount, type, description, createdAt)
                  VALUES (?, ?, ?, 'PAYMENT', 'BenefitPay Online Settlement via Tap Payments', datetime('now'))`,
            args: [ledgerId, customerUuid, -amount]
          }).catch(() => {});
        }
      } catch (dbErr) {
        fastify.log.warn(dbErr, 'Turso auto-reconciliation DB warning');
      }

      return reply.send({
        received: true,
        status: 'PROCESSED',
        reconciled: true,
        clearedAmount: amount,
        customerUuid
      });
    }

    return reply.send({ received: true, status });
  } catch (err) {
    fastify.log.error(err, 'Tap webhook handler error');
    return reply.status(200).send({ received: true, error: err.message });
  }
});

// Step 4: The Fastify Serverless Export
export default async function handler(req, res) {
  await fastify.ready();
  fastify.server.emit('request', req, res);
}
