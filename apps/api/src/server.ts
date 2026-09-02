import 'dotenv/config';
import Fastify, { FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import bcrypt from 'bcrypt';
import { prisma } from '@starline/database';
import { ProcessSaleInputSchema } from '@starline/contracts';
import khataRoutes from './routes/khata';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      id: string;
      tenantId: string;
      role: 'CASHIER' | 'STORE_MANAGER' | 'ADMIN';
    };
  }
}

const app = Fastify({ logger: true });

app.register(cors, { origin: true, credentials: true });
app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET || 'super-secret-secure-erp-token-key-32chars',
});

const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.status(401).send({ success: false, error: 'Unauthorized: Invalid or missing token' });
  }
};

const requireManager = async (request: FastifyRequest, reply: FastifyReply) => {
  await authenticate(request, reply);
  if (request.user && request.user.role === 'CASHIER') {
    return reply.status(403).send({ success: false, error: 'Forbidden: Insufficient privileges' });
  }
};

app.register(khataRoutes, { prefix: '/api' });

app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

app.post('/api/auth/login', async (request, reply) => {
  const { email, password } = request.body as { email?: string; password?: string };

  if (!email || !password) {
    return reply.status(400).send({ success: false, error: 'Email and password are required' });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return reply.status(401).send({ success: false, error: 'Invalid email or password' });
  }

  const token = app.jwt.sign({
    id: user.id,
    tenantId: user.tenantId,
    role: user.role,
  });

  return reply.send({
    success: true,
    token,
    role: user.role,
  });
});

app.post(
  '/api/pos/checkout',
  { preHandler: [authenticate] },
  async (request, reply) => {
    const validationResult = ProcessSaleInputSchema.safeParse(request.body);

    if (!validationResult.success) {
      return reply.status(400).send({
        success: false,
        error: 'Validation Failed',
        details: validationResult.error.format(),
      });
    }

    const data = validationResult.data;

    try {
      const result = await prisma.$transaction(async (tx) => {
        let subtotal = 0;
        const orderItemsData = [];

        for (const item of data.items) {
          const products: any[] = await tx.$queryRaw`
            SELECT id, sku, name, price, "stockQty" 
            FROM "Product" 
            WHERE sku = ${item.sku} AND "tenantId" = ${data.tenantId}
            FOR UPDATE
          `;

          const product = products[0];
          if (!product || product.stockQty < item.quantity) {
            throw new Error(`Insufficient stock or product not found for SKU: ${item.sku}`);
          }

          await tx.product.update({
            where: { id: product.id },
            data: { stockQty: product.stockQty - item.quantity },
          });

          const lineTotal = Number(product.price) * item.quantity;
          subtotal += lineTotal;

          orderItemsData.push({
            productId: product.id,
            name: product.name,
            qty: item.quantity,
            quantity: item.quantity,
            unitPrice: product.price,
            price: product.price,
            total: lineTotal,
          });
        }

        const tax = Number((subtotal * 0.05).toFixed(2));
        const grandTotal = subtotal + tax;

        const order = await tx.order.create({
          data: {
            orderNo: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            tenantId: data.tenantId,
            customerId: (data as any).customerId || (data as any).clientId,
            paymentMethod: data.paymentMethod as any,
            totalAmount: grandTotal,
            status: data.paymentMethod === 'CREDIT_LEDGER' ? 'PENDING' : 'COMPLETED',
            items: { create: orderItemsData },
          },
          include: { items: true },
        });

        return { orderId: order.id, grandTotal, order };
      });

      return reply.status(201).send({
        success: true,
        message: 'Sale processed successfully',
        ...result,
      });
    } catch (error: any) {
      request.log.error(error);
      return reply.status(400).send({
        success: false,
        error: error.message || 'Internal server error during checkout transaction',
      });
    }
  }
);

app.get('/api/products', { preHandler: [authenticate] }, async (request, reply) => {
  const products = await prisma.product.findMany({
    where: { tenantId: request.user.tenantId },
    orderBy: { name: 'asc' },
  });

  return reply.send({
    success: true,
    count: products.length,
    products,
  });
});

app.post('/api/products', { preHandler: [requireManager] }, async (request, reply) => {
  const { sku, name, price, stockQty } = request.body as {
    sku: string;
    name: string;
    price: number;
    stockQty: number;
  };

  if (!sku || !name || price == null || stockQty == null) {
    return reply.status(400).send({ success: false, error: 'Missing required fields: sku, name, price, stockQty' });
  }

  try {
    const product = await prisma.product.create({
      data: {
        tenantId: request.user.tenantId,
        sku,
        name,
        price,
        stockQty,
      },
    });

    return reply.status(201).send({
      success: true,
      message: 'Product created successfully',
      product,
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(400).send({ success: false, error: 'Product SKU already exists or creation failed' });
  }
});

app.patch('/api/products/:id/stock', { preHandler: [requireManager] }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const { adjustmentQty } = request.body as { adjustmentQty?: number };

  if (typeof adjustmentQty !== 'number') {
    return reply.status(400).send({ success: false, error: 'Invalid or missing adjustmentQty' });
  }

  try {
    const updated = await prisma.product.update({
      where: { id },
      data: {
        stockQty: { increment: adjustmentQty },
      },
    });

    return reply.send({
      success: true,
      message: 'Stock updated successfully',
      product: updated,
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(400).send({ success: false, error: 'Product not found or stock update failed' });
  }
});

app.get('/api/reports/eod', { preHandler: [requireManager] }, async (request, reply) => {
  const query = request.query as { date?: string };
  const targetDate = query.date ? new Date(query.date) : new Date();

  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);

  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  try {
    const orders = await prisma.order.findMany({
      where: {
        tenantId: request.user.tenantId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      include: { items: true },
    });

    let totalRevenue = 0;
    let totalTax = 0;
    const paymentBreakdown: Record<string, { count: number; total: number }> = {
      CASH: { count: 0, total: 0 },
      CARD: { count: 0, total: 0 },
      CREDIT_LEDGER: { count: 0, total: 0 },
    };

    for (const ord of orders) {
      const ordTotal = Number(ord.totalAmount);
      const ordTax = ordTotal - ordTotal / 1.05;

      totalRevenue += ordTotal;
      totalTax += ordTax;

      const method = ord.paymentMethod || 'CASH';
      if (!paymentBreakdown[method]) {
        paymentBreakdown[method] = { count: 0, total: 0 };
      }
      paymentBreakdown[method].count += 1;
      paymentBreakdown[method].total += ordTotal;
    }

    return reply.send({
      success: true,
      reportDate: startOfDay.toISOString().split('T')[0],
      totalOrders: orders.length,
      grossSales: Number((totalRevenue - totalTax).toFixed(2)),
      totalTax: Number(totalTax.toFixed(2)),
      netRevenue: Number(totalRevenue.toFixed(2)),
      paymentBreakdown,
    });
  } catch (error: any) {
    request.log.error(error);
    return reply.status(500).send({ success: false, error: 'Failed to generate EOD summary' });
  }
});

const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8010;
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`Fastify API Server running on http://0.0.0.0:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
