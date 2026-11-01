const fs = require('fs');
let code = fs.readFileSync('src/components/PaymentModal.tsx', 'utf8');

code = code.replace(
  'invoiceNo: data.invoice || invoiceNo,',
  'invoiceNo: data.formattedInvoice || data.invoice || data.invoiceNo || invoiceNo,'
);

code = code.replace(
  '<div style={{ fontSize: \'10px\' }}>Invoice: #{completedSale?.invoiceNo || `INV-${Date.now()}`}</div>',
  '<div style={{ fontSize: \'11px\', fontWeight: \'bold\' }}>Invoice: {completedSale?.invoiceNo || \'INV-005000\'}</div>'
);

code = code.replace(
  '<strong>#{completedSale.invoiceNo}</strong>',
  '<strong>{completedSale.invoiceNo}</strong>'
);

code = code.replace(
  '? `Invoice #${completedSale.invoiceNo} successfully finalized`',
  '? `Invoice ${completedSale.invoiceNo} successfully finalized`'
);

fs.writeFileSync('src/components/PaymentModal.tsx', code, 'utf8');
console.log('Successfully updated PaymentModal.tsx!');
