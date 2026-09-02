import { FastifyInstance } from 'fastify';
import { PrismaClient, PaymentType, TransactionType } from '@prisma/client';

const prisma = new PrismaClient();

export default async function khataRoutes(fastify: FastifyInstance) {
  // ==========================================
  // 1. DASHBOARD & OVERVIEW ANALYTICS
  // ==========================================
  fastify.get('/analytics/overview', async (req, reply) => {
    try {
      const [customers, invoices, purchases, recentTxns] = await Promise.all([
        prisma.customer.findMany({ select: { currentDue: true } }),
        prisma.invoice.findMany({ select: { grandTotal: true } }),
        prisma.purchase.findMany({ select: { amount: true } }),
        prisma.transaction.findMany({
          take: 8,
          orderBy: { createdAt: 'desc' },
          include: { customer: { select: { name: true } } },
        }),
      ]);

      const totalReceivable = customers.reduce((sum, c) => {
        const due = Number(c.currentDue);
        return due > 0 ? sum + due : sum;
      }, 0);

      const totalSales = invoices.reduce((sum, inv) => sum + Number(inv.grandTotal), 0);
      const totalPurchases = purchases.reduce((sum, p) => sum + Number(p.amount), 0);

      return {
        totalReceivable,
        totalSales,
        totalPurchases,
        customerCount: customers.length,
        invoiceCount: invoices.length,
        recentTxns,
      };
    } catch (err: any) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch analytics overview' });
    }
  });

  // ==========================================
  // 2. CUSTOMERS / PARTIES
  // ==========================================
  fastify.get('/customers', async (req, reply) => {
    try {
      const customers = await prisma.customer.findMany({
        orderBy: { updatedAt: 'desc' },
        include: {
          transactions: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
        },
      });

      const totalReceivable = customers.reduce((sum, c) => {
        const due = Number(c.currentDue);
        return due > 0 ? sum + due : sum;
      }, 0);

      return { customers, totalReceivable };
    } catch (err: any) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch customer list' });
    }
  });

  fastify.post('/customers', async (req: any, reply) => {
    const { name, phone, address } = req.body || {};
    if (!name?.trim() || !phone?.trim()) {
      return reply.code(400).send({ error: 'Name and phone number are required' });
    }

    try {
      const customer = await prisma.customer.create({
        data: {
          name: name.trim(),
          phone: phone.trim(),
          address: address?.trim() || null,
          currentDue: 0.0,
        },
      });

      return { success: true, customer };
    } catch (err: any) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to create customer' });
    }
  });

  fastify.get('/customers/:id', async (req: any, reply) => {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: req.params.id },
        include: {
          transactions: {
            orderBy: { createdAt: 'desc' },
          },
          invoices: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!customer) return reply.code(404).send({ error: 'Customer not found' });
      return customer;
    } catch (err: any) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch customer details' });
    }
  });

  // ==========================================
  // 3. LEDGER TRANSACTIONS (YOU GAVE / YOU GOT)
  // ==========================================
  fastify.post('/transactions', async (req: any, reply) => {
    const { customerId, type, amount, note } = req.body || {};
    const numAmount = Number(amount);

    if (!customerId || !type || !numAmount || numAmount <= 0) {
      return reply.code(400).send({ error: 'Invalid transaction parameters' });
    }

    if (!['YOU_GAVE', 'YOU_GOT'].includes(type)) {
      return reply.code(400).send({ error: 'Invalid transaction type' });
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const txn = await tx.transaction.create({
          data: {
            customerId,
            type: type as TransactionType,
            amount: numAmount,
            note: note?.trim() || null,
          },
        });

        // YOU_GAVE increases the due balance; YOU_GOT decreases it
        const delta = type === 'YOU_GAVE' ? numAmount : -numAmount;
        const updatedCustomer = await tx.customer.update({
          where: { id: customerId },
          data: {
            currentDue: { increment: delta },
            updatedAt: new Date(),
          },
        });

        return { txn, updatedCustomer };
      });

      return { success: true, ...result };
    } catch (err: any) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to process ledger entry' });
    }
  });

  // ==========================================
  // 4. INVOICES / BILLING
  // ==========================================
  fastify.get('/invoices', async (req, reply) => {
    try {
      const invoices = await prisma.invoice.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          customer: {
            select: { name: true, phone: true },
          },
        },
      });
      return invoices;
    } catch (err: any) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch invoices' });
    }
  });

  fastify.post('/invoices', async (req: any, reply) => {
    const {
      partyName,
      partyPhone,
      customerId,
      items,
      subtotal,
      tax,
      grandTotal,
      paymentType = 'CASH',
    } = req.body || {};

    if (!partyName || !Array.isArray(items) || items.length === 0) {
      return reply.code(400).send({ error: 'Party name and at least one item are required' });
    }

    const validPaymentType = ['CASH', 'UPI', 'CREDIT'].includes(paymentType)
      ? (paymentType as PaymentType)
      : PaymentType.CASH;

    const numSubtotal = Number(subtotal);
    const numTax = Number(tax || 0);
    const numGrandTotal = Number(grandTotal);

    try {
      const invoice = await prisma.$transaction(async (tx) => {
        const count = await tx.invoice.count();
        const invoiceNo = `LAY-${String(count + 1).padStart(4, '0')}`;

        const createdInvoice = await tx.invoice.create({
          data: {
            invoiceNo,
            customerId: customerId || null,
            partyName: partyName.trim(),
            partyPhone: partyPhone?.trim() || null,
            itemsJson: JSON.stringify(items),
            subtotal: numSubtotal,
            tax: numTax,
            grandTotal: numGrandTotal,
            paymentType: validPaymentType,
          },
        });

        // If Credit sale linked to a customer, update ledger automatically
        if (validPaymentType === 'CREDIT' && customerId) {
          await tx.transaction.create({
            data: {
              customerId,
              type: 'YOU_GAVE',
              amount: numGrandTotal,
              note: `Invoice #${invoiceNo}`,
            },
          });

          await tx.customer.update({
            where: { id: customerId },
            data: {
              currentDue: { increment: numGrandTotal },
              updatedAt: new Date(),
            },
          });
        }

        return createdInvoice;
      });

      return { success: true, invoice };
    } catch (err: any) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to generate invoice' });
    }
  });

  // ==========================================
  // 5. PURCHASES & INWARD EXPENSES
  // ==========================================
  fastify.get('/purchases', async (req, reply) => {
    try {
      const purchases = await prisma.purchase.findMany({
        orderBy: { createdAt: 'desc' },
      });
      return purchases;
    } catch (err: any) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to fetch purchases' });
    }
  });

  fastify.post('/purchases', async (req: any, reply) => {
    const { billNo, vendorName, amount, note, paymentMode = 'CASH' } = req.body || {};
    const numAmount = Number(amount);

    if (!vendorName?.trim() || !numAmount || numAmount <= 0) {
      return reply.code(400).send({ error: 'Vendor name and positive amount are required' });
    }

    const validPaymentMode = ['CASH', 'UPI', 'CREDIT'].includes(paymentMode)
      ? (paymentMode as PaymentType)
      : PaymentType.CASH;

    try {
      const purchase = await prisma.purchase.create({
        data: {
          billNo: billNo?.trim() || `PUR-${Date.now().toString().slice(-6)}`,
          vendorName: vendorName.trim(),
          amount: numAmount,
          note: note?.trim() || null,
          paymentMode: validPaymentMode,
        },
      });

      return { success: true, purchase };
    } catch (err: any) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to record purchase' });
    }
  });

  // ==========================================
  // 6. STORE PROFILE CONFIGURATION
  // ==========================================
  fastify.get('/store-profile', async (req, reply) => {
    try {
      const profile = await prisma.storeProfile.upsert({
        where: { id: 'default-store' },
        update: {},
        create: {
          id: 'default-store',
          name: 'LAYALI LUXURY PERFUMES & ATTIRE',
          phone: '+91 98765 43210',
          address: 'City Center Mall, Ground Floor',
          gstin: '32AAAAA0000A1Z5',
          upiId: 'layali@upi',
        },
      });
      return profile;
    } catch (err: any) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to retrieve store profile' });
    }
  });

  fastify.put('/store-profile', async (req: any, reply) => {
    const { name, phone, address, gstin, upiId } = req.body || {};

    try {
      const profile = await prisma.storeProfile.upsert({
        where: { id: 'default-store' },
        update: {
          name: name?.trim(),
          phone: phone?.trim(),
          address: address?.trim(),
          gstin: gstin?.trim(),
          upiId: upiId?.trim(),
        },
        create: {
          id: 'default-store',
          name: name?.trim() || 'LAYALI LUXURY PERFUMES & ATTIRE',
          phone: phone?.trim() || '+91 98765 43210',
          address: address?.trim() || 'City Center Mall, Ground Floor',
          gstin: gstin?.trim() || null,
          upiId: upiId?.trim() || null,
        },
      });

      return { success: true, profile };
    } catch (err: any) {
      fastify.log.error(err);
      return reply.code(500).send({ error: 'Failed to update store profile' });
    }
  });
}