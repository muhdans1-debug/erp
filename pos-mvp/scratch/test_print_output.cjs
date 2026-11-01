// 58mm thermal paper fits 32 characters per line in standard font
const formatTwoCols = (left, right, width = 32) => {
  const leftTrim = left.length > width - right.length - 1
    ? left.slice(0, width - right.length - 2) + '.'
    : left;
  const spaces = Math.max(1, width - leftTrim.length - right.length);
  return `${leftTrim}${' '.repeat(spaces)}${right}\n`;
};

function generateReceiptPreview({
  shopName = "ASKAR SUPERMARKET",
  shopAddress = "Askar, Kingdom of Bahrain",
  shopPhone = "Tel: +973 1700 0000",
  vatNumber = "200012345678901",
  invoiceNo = "INV-005001",
  items = [
    { name: "Almarai Fresh Milk 2L", sellingPrice: 1.100, quantity: 1, vatRate: 0 },
    { name: "Red Onions 1kg", sellingPrice: 0.250, quantity: 2, vatRate: 0 },
    { name: "Arabian Perfume", sellingPrice: 25.500, quantity: 1, vatRate: 10 }
  ],
  subtotal = 27.100,
  vat = 2.318,
  total = 29.418,
  paymentMode = "CASH",
  cashierName = "Cashier 01"
}) {
  const now = new Date();
  const formattedDate = `${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  let cleanInvoice = (invoiceNo !== undefined && invoiceNo !== null) ? String(invoiceNo).trim() : '';
  if (!cleanInvoice || cleanInvoice === '0' || cleanInvoice === 'INV-0' || cleanInvoice.includes('undefined')) {
    cleanInvoice = 'INV-005000';
  }
  const finalInvoiceDisplay = cleanInvoice.startsWith('INV-') 
    ? cleanInvoice 
    : (cleanInvoice.startsWith('#') ? cleanInvoice.slice(1) : cleanInvoice);

  let out = "";
  out += "================================\n";
  out += "       " + shopName + "        \n";
  out += "    Simplified Tax Invoice      \n";
  out += "     فاتورة ضريبية مبسطة       \n";
  out += `    VAT No: ${vatNumber}     \n`;
  out += `   ${shopAddress}    \n`;
  out += `       ${shopPhone}        \n`;
  out += "================================\n";
  out += formatTwoCols("Invoice:", finalInvoiceDisplay);
  out += formatTwoCols("Date:", formattedDate);
  out += formatTwoCols(`Staff: ${cashierName}`, `Mode: ${paymentMode}`);
  out += "--------------------------------\n";
  out += formatTwoCols("Item", "Qty   Amt(BD)");
  out += "--------------------------------\n";

  let totalQty = 0;
  for (const item of items) {
    const count = item.quantity || 1;
    totalQty += count;
    const isVat10 = item.vatRate === 10;
    out += `${item.name}${isVat10 ? ' *' : ''}\n`;
    const qtyLine = `  ${count} x BD ${item.sellingPrice.toFixed(3)}`;
    out += formatTwoCols(qtyLine, `BD ${(item.sellingPrice * count).toFixed(3)}`);
  }

  out += "--------------------------------\n";
  out += formatTwoCols("Subtotal:", `BD ${subtotal.toFixed(3)}`);
  out += formatTwoCols("VAT (10%):", `BD ${vat.toFixed(3)}`);
  out += "--------------------------------\n";
  out += formatTwoCols("TOTAL:", `BD ${total.toFixed(3)}`);
  out += "--------------------------------\n";
  out += `Total Items Count: ${totalQty}\n`;
  out += "* Item includes 10% VAT\n";
  out += `Invoice: ${finalInvoiceDisplay}\n`;
  out += "THANK YOU FOR SHOPPING!\n";
  out += "Please retain invoice for returns.\n";
  out += "================================\n";

  return out;
}

const preview = generateReceiptPreview({});
console.log(preview);
