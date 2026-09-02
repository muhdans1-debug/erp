import Fastify from 'fastify';
import cors from '@fastify/cors';
import { prisma } from '@starline/database';
import { ProcessSaleInputSchema } from '@starline/contracts';

const app = Fastify({ logger: true });
app.register(cors, { origin: true });

app.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

app.post('/api/sales', async (request, reply) => {
  const validationResult = ProcessSaleInputSchema.safeParse(request.body);
  
  if (!validationResult.success) {
    return reply.status(400).send({
      error: 'Validation Failed',
      details: validationResult.error.format()
    });
  }

  const data = validationResult.data;

  try {
    const order = await prisma.$transaction(async (tx) => {
      let totalAmount = 0;
      const orderItemsData = [];

      for (const item of data.items) {
        const product = await tx.product.findUnique({
          where: { sku: item.sku }
        });

        if (!product || product.stockQty < item.quantity) {
          throw new Error(`Insufficient stock or product not found for SKU: ${item.sku}`);
        }

        await tx.product.update({
          where: { sku: item.sku },
          data: { stockQty: product.stockQty - item.quantity }
        });

        totalAmount += product.price * item.quantity;
        orderItemsData.push({
          productId: product.id,
          quantity: item.quantity,
          unitPrice: product.price
        });
      }

      return await tx.order.create({
        data: {
          tenantId: data.tenantId,
          clientId: data.clientId,
          paymentMethod: data.paymentMethod,
          totalAmount,
          status: 'COMPLETED',
          items: {
            create: orderItemsData
          }
        },
        include: { items: true }
      });
    });

    return reply.status(201).send({
      success: true,
      message: 'Sale processed successfully',
      order
    });

  } catch (error: any) {
    request.log.error(error);
    return reply.status(400).send({
      success: false,
      error: error.message || 'Internal server error during transaction'
    });
  }
});

const start = async () => {
  try {
    const port = process.env.PORT ? parseInt(process.env.PORT) : 4000;
    await app.listen({ port, host: '0.0.0.0' });
    console.log(`Fastify API Server running on http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();