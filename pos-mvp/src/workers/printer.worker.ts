// pos-mvp/src/workers/printer.worker.ts

export interface PrintCommand {
  action: 'setAlignment' | 'printText';
  data: number | string;
}

export interface WorkerReceiptPayload {
  invoiceNo: string;
  items: Array<{
    name: string;
    nameAr?: string;
    price: number;
    qty: number;
    taxRate?: number;
  }>;
  total: number;
}

self.onmessage = (event: MessageEvent) => {
  const { type, payload } = event.data as { type: string; payload: WorkerReceiptPayload };

  if (type === 'GENERATE_RECEIPT') {
    const commands: PrintCommand[] = [];

    // 1. Header Formatting
    commands.push({ action: 'setAlignment', data: 1 }); // Center
    commands.push({ action: 'printText', data: 'ASKAR SUPERMARKET\n' });
    commands.push({ action: 'printText', data: `Invoice: ${payload.invoiceNo}\n` });

    // 2. Heavy Item Loop & Arabic Padding Calculation
    commands.push({ action: 'setAlignment', data: 0 }); // Left
    commands.push({ action: 'printText', data: '--------------------------------\n' });

    let totalVat = 0;

    for (const item of payload.items || []) {
      const isTaxable = item.taxRate === 10;
      const vatIndicator = isTaxable ? '*' : ' ';
      if (isTaxable) {
        totalVat += (item.price * item.qty) - ((item.price * item.qty) / 1.1);
      }

      // Calculate exact 32-character spacing
      const name = (item.name + vatIndicator).substring(0, 15).padEnd(15, ' ');
      const qty = item.qty.toString().padStart(3, ' ');
      const price = (item.price * item.qty).toFixed(3).padStart(9, ' ');

      commands.push({ action: 'setAlignment', data: 0 });
      commands.push({ action: 'printText', data: `${name} ${qty}      ${price}\n` });

      if (item.nameAr) {
        commands.push({ action: 'setAlignment', data: 2 }); // Right Align
        commands.push({ action: 'printText', data: `${item.nameAr} ${vatIndicator}\n` });
      }
    }

    // 3. Totals Formatting
    commands.push({ action: 'setAlignment', data: 0 });
    commands.push({ action: 'printText', data: '--------------------------------\n' });
    commands.push({ action: 'printText', data: `Total: BHD ${Number(payload.total).toFixed(3)}\n` });

    // Post the finalized array of commands back to the main thread
    self.postMessage({ type: 'RECEIPT_READY', commands });
  }
};

export {};

