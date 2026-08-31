import { z } from 'zod';

export const ProcessSaleInputSchema = z.object({
  tenantId: z.string().uuid(),
  clientId: z.string().uuid(),
  paymentMethod: z.enum(['CASH', 'CARD', 'CREDIT_LEDGER']),
  items: z.array(
    z.object({
      sku: z.string().min(1),
      quantity: z.number().int().positive(),
    })
  ).min(1),
});

export type ProcessSaleInput = z.infer<typeof ProcessSaleInputSchema>;

export const ClientLedgerQuerySchema = z.object({
  tenantId: z.string().uuid(),
  accountNumber: z.string().min(1),
});

export type ClientLedgerQuery = z.infer<typeof ClientLedgerQuerySchema>;
