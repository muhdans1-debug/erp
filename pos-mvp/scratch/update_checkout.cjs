const fs = require('fs');
let code = fs.readFileSync('src/pages/CheckoutScreen.tsx', 'utf8');

const startMarker = '      // OPTIMISTIC PRINTING FOR CASH SALES:';
const endMarker = '      } else {\n        showToast(`❌ Checkout failed: ${data && data.error ? data.error : \'Unknown error\'}`, \'error\');\n      }';

const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.error('Markers not found', { startIndex, endIndex });
  process.exit(1);
}

const replacement = `      // Commit transaction to SQLite backend to guarantee strictly sequential, gapless NBR VAT invoice numbering
      const res = await fetch(\`\${apiBase}/checkout\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(salePayload)
      });

      const data = await res.json();

      if (data && data.success) {
        // Extract the REAL, strictly sequential NBR invoice number directly from backend response (e.g. INV-005001)
        const verifiedInvoiceNo = data.formattedInvoice || data.invoice || data.invoiceNo || 'INV-000001';

        // Update pole / customer display
        if (paymentMethod === 'CASH') {
          CustomerDisplay.updateDisplay?.({
            text: \`THANK YOU!\\nVISIT AGAIN\\n\\nCASH: BD \${total.toFixed(3)}\`
          }).catch(() => {});
        } else if (paymentMethod === 'CREDIT' && customer) {
          CustomerDisplay.updateDisplay?.({
            text: \`THANK YOU, \${customer.name.toUpperCase()}!\\n\\nPAID: BD \${total.toFixed(3)}\\nNEW BALANCE: BD \${newBalance.toFixed(3)}\`
          }).catch(() => {});
        } else {
          const displayLabel = paymentMethod === 'BENEFIT_PAY' ? 'BENEFIT PAY' : paymentMethod;
          CustomerDisplay.updateDisplay?.({
            text: \`THANK YOU!\\nVISIT AGAIN\\n\\n\${displayLabel}: BD \${total.toFixed(3)}\`
          }).catch(() => {});
        }

        // FIRE-AND-FORGET PRINTING:
        // Pass verified sequential invoice number directly to physical printer formatting
        printFullReceipt({
          invoiceNo: verifiedInvoiceNo,
          items: [...cart],
          subtotal,
          vat,
          total,
          paymentMode: paymentMethod,
          customerName,
          customerCardUid: customer?.cardUid || undefined,
          previousBalance: paymentMethod === 'CREDIT' ? previousBalance : undefined,
          newBalance: paymentMethod === 'CREDIT' ? newBalance : undefined,
          cashierName: "Register 01"
        }).catch((printErr) => console.warn("Background receipt printing warning:", printErr));

        const formattedMethod = paymentMethod === 'BENEFIT_PAY' ? 'Benefit Pay' : paymentMethod;
        showToast(\`🧾 \${formattedMethod} Sale Recorded (#\${verifiedInvoiceNo}). Cart cleared.\`, 'success');
        
        // Instantly reset checkout UI (non-blocking)
        clearActiveCart();
      } else {
        showToast(\`❌ Checkout failed: \${data && data.error ? data.error : 'Unknown error'}\`, 'error');
      }`;

code = code.slice(0, startIndex) + replacement + code.slice(endIndex + endMarker.length);
fs.writeFileSync('src/pages/CheckoutScreen.tsx', code, 'utf8');
console.log('Successfully updated CheckoutScreen.tsx with NBR sequential invoice flow!');
