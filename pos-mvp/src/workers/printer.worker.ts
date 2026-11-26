// pos-mvp/src/workers/printer.worker.ts

import { generateNBRReceiptHtml, ReceiptTemplateProps } from '../utils/receiptTemplate';

export interface PrintCommand {
  action: 'setAlignment' | 'printText';
  data: number | string;
}

export type WorkerReceiptPayload = ReceiptTemplateProps;

self.onmessage = (event: MessageEvent) => {
  const { type, payload } = event.data as { type: string; payload: WorkerReceiptPayload };

  if (type === 'GENERATE_RECEIPT') {
    const html = generateNBRReceiptHtml(payload);
    const commands: PrintCommand[] = [];

    // Hardware ESC/POS command stream (with clean single dashes and strict 32-col layout)
    commands.push({ action: 'setAlignment', data: 1 }); // Center
    commands.push({ action: 'printText', data: `${payload.shopName || 'LAYALI SUPERMARKET'}\n` });
    commands.push({ action: 'printText', data: `${payload.shopNameAr || 'أسواق ليالي المركزية'}\n` });
    commands.push({ action: 'printText', data: 'SIMPLIFIED TAX INVOICE\n' });
    commands.push({ action: 'printText', data: 'فاتورة ضريبية مبسطة\n' });
    commands.push({ action: 'printText', data: `C.R. No: ${payload.crNumber || '790614189'}\n` });
    commands.push({ action: 'printText', data: `VAT TRN: ${payload.vatNumber || '200012345678901'}\n` });
    commands.push({ action: 'printText', data: `Tel: ${payload.shopPhone || '+973 33843855'}\n` });
    if (payload.isReprint) {
      commands.push({ action: 'printText', data: '--------------------------------\n' });
      commands.push({ action: 'printText', data: '*** DUPLICATE / REPRINT COPY ***\n' });
      commands.push({ action: 'printText', data: 'نسخة معاد طباعتها\n' });
    }
    commands.push({ action: 'printText', data: '--------------------------------\n' });

    commands.push({ action: 'setAlignment', data: 0 }); // Left
    const inv = `Inv: ${payload.invoiceNo || 'INV-000000'}`;
    const date = `Date: ${payload.dateStr || new Date().toLocaleDateString()}`;
    commands.push({ action: 'printText', data: `${inv.padEnd(16)}${date.padStart(16)}\n` });
    const staff = `Staff: ${payload.staffName || 'Register 01'}`;
    const mode = `Mode: ${payload.paymentMode || 'CASH'}`;
    commands.push({ action: 'printText', data: `${staff.padEnd(16)}${mode.padStart(16)}\n` });
    commands.push({ action: 'printText', data: '--------------------------------\n' });

    // Column Headers
    commands.push({ action: 'printText', data: 'Item             Qty     Amt(BD)\n' });
    commands.push({ action: 'printText', data: '--------------------------------\n' });

    for (const item of payload.items || []) {
      const isTaxable = item.vatRate === 10 || (item.vatRate === undefined && item.taxRate !== 0);
      const vatIndicator = isTaxable ? '*' : ' ';
      const name = (item.name + vatIndicator).substring(0, 16).padEnd(16, ' ');
      const qtyStr = item.is_weighed_item ? `${Number(item.qty).toFixed(2)}k` : String(item.qty);
      const qty = qtyStr.padStart(5, ' ');
      const price = (item.price * item.qty).toFixed(3).padStart(9, ' ');

      commands.push({ action: 'setAlignment', data: 0 });
      commands.push({ action: 'printText', data: `${name} ${qty} ${price}\n` });

      if (item.nameAr) {
        commands.push({ action: 'setAlignment', data: 2 });
        commands.push({ action: 'printText', data: `${item.nameAr} ${vatIndicator}\n` });
      }
    }

    const subtotal = payload.subtotal !== undefined
      ? Number(payload.subtotal)
      : Number((payload.total / 1.1).toFixed(3));
    const vat = payload.vat !== undefined
      ? Number(payload.vat)
      : Number((payload.total - subtotal).toFixed(3));

    commands.push({ action: 'setAlignment', data: 0 });
    commands.push({ action: 'printText', data: '--------------------------------\n' });
    commands.push({ action: 'printText', data: `Subtotal:`.padEnd(16) + `BD ${subtotal.toFixed(3)}`.padStart(16) + '\n' });
    commands.push({ action: 'printText', data: `VAT (10%):`.padEnd(16) + `BD ${vat.toFixed(3)}`.padStart(16) + '\n' });
    commands.push({ action: 'printText', data: '================================\n' });
    commands.push({ action: 'setAlignment', data: 1 });
    commands.push({ action: 'printText', data: 'TOTAL / المجموع الإجمالي\n' });
    commands.push({ action: 'printText', data: `BD ${Number(payload.total).toFixed(3)}\n` });
    commands.push({ action: 'printText', data: '================================\n' });

    const payMode = (payload.paymentMode || 'CASH').toUpperCase();
    if (payMode === 'CREDIT' || payMode === 'KHATA' || payMode === 'CREDIT_PERSONAL') {
      const prevBal = Number(payload.previousBalance || 0);
      const newBal = payload.newBalance !== undefined ? Number(payload.newBalance) : (prevBal + Number(payload.total));
      commands.push({ action: 'setAlignment', data: 1 });
      commands.push({ action: 'printText', data: '*** KHATA CREDIT ACCOUNT ***\n' });
      commands.push({ action: 'setAlignment', data: 0 });
      if (payload.customerName) commands.push({ action: 'printText', data: `Customer: ${payload.customerName}\n` });
      commands.push({ action: 'printText', data: `Previous Debt:`.padEnd(16) + `BD ${prevBal.toFixed(3)}`.padStart(16) + '\n' });
      commands.push({ action: 'printText', data: `This Bill:`.padEnd(16) + `+BD ${Number(payload.total).toFixed(3)}`.padStart(16) + '\n' });
      commands.push({ action: 'printText', data: '================================\n' });
      commands.push({ action: 'setAlignment', data: 1 });
      commands.push({ action: 'printText', data: '>>> TOTAL BALANCE DUE <<<\n' });
      commands.push({ action: 'printText', data: 'إجمالي الرصيد المستحق\n' });
      commands.push({ action: 'printText', data: `BD ${newBal.toFixed(3)}\n` });
      commands.push({ action: 'printText', data: '================================\n' });
    }

    // Post finalized HTML and commands back to main thread
    self.postMessage({ type: 'RECEIPT_READY', html, commands });
  }
};

export {};
