const fs = require('fs');
let code = fs.readFileSync('src/pages/CheckoutScreen.tsx', 'utf8');

// 1. Add Truck and ReceivingDrawer import
if (!code.includes('ReceivingDrawer')) {
  code = code.replace(
    "import { Search, X, Plus, LogOut, Wifi, HardDrive, RefreshCw, ScanLine, ShoppingCart, UserX, Lock, Unlock } from 'lucide-react';",
    "import { Search, X, Plus, LogOut, Wifi, HardDrive, RefreshCw, ScanLine, ShoppingCart, UserX, Lock, Unlock, Truck } from 'lucide-react';"
  );
  code = code.replace(
    "import { AddQuickProductModal } from '../components/AddQuickProductModal';",
    "import { AddQuickProductModal } from '../components/AddQuickProductModal';\nimport ReceivingDrawer from '../components/ReceivingDrawer';"
  );
}

// 2. Add state and ref
const stateTarget = "  const [showDevPanel, setShowDevPanel] = useState(false);";
const stateAdd = "  const [showDevPanel, setShowDevPanel] = useState(false);\n  const [showReceivingDrawer, setShowReceivingDrawer] = useState(false);\n  const receivingScanCallbackRef = useRef<((barcode: string) => boolean) | null>(null);";
if (!code.includes('showReceivingDrawer')) {
  code = code.replace(stateTarget, stateAdd);
}

// 3. Update handleBarcodeScan with receiving scan audit hook
const scanTarget = "    // MODE 1: BARCODE ASSIGNMENT MODE";
const scanAdd = `    // MODE 0: RECEIVING DRAWER BARCODE AUDIT
    if (showReceivingDrawer && receivingScanCallbackRef.current) {
      const handled = receivingScanCallbackRef.current(cleanCode);
      if (handled) return;
    }

    // MODE 1: BARCODE ASSIGNMENT MODE`;
if (!code.includes('// MODE 0: RECEIVING DRAWER BARCODE AUDIT')) {
  code = code.replace(scanTarget, scanAdd);
}

// 4. Add Truck Receiving button in top header
const headerTarget = `<button 
            type="button"
            onClick={() => {
              setShowKhataHub(true);
              loadCustomers();
            }}`;

const headerAdd = `<button 
            type="button"
            onClick={() => setShowReceivingDrawer(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-bold rounded-lg text-xs border border-emerald-200 transition-all cursor-pointer whitespace-nowrap shadow-xs"
            title="Open Delivery Receiving Drawer [Manager PIN 9999]"
          >
            <Truck size={14} className="text-emerald-600" />
            <span>Receiving</span>
          </button>

          <button 
            type="button"
            onClick={() => {
              setShowKhataHub(true);
              loadCustomers();
            }}`;
if (!code.includes('title="Open Delivery Receiving Drawer [Manager PIN 9999]"')) {
  code = code.replace(headerTarget, headerAdd);
}

// 5. Render ReceivingDrawer
const drawerTarget = "{/* BENEFITPAY & POS PAYMENT MODAL */}";
const drawerAdd = `{/* PIN-LOCKED RECEIVING DRAWER (IN-TRANSIT POS & BARCODE AUDITING) */}
      <ReceivingDrawer
        isOpen={showReceivingDrawer}
        onClose={() => setShowReceivingDrawer(false)}
        apiBase={apiBase}
        onCatalogRefresh={fetchCatalog}
        registerScanListener={(cb) => { receivingScanCallbackRef.current = cb; }}
      />

      {/* BENEFITPAY & POS PAYMENT MODAL */}`;
if (!code.includes('<ReceivingDrawer')) {
  code = code.replace(drawerTarget, drawerAdd);
}

fs.writeFileSync('src/pages/CheckoutScreen.tsx', code, 'utf8');
console.log('Successfully updated CheckoutScreen.tsx with Receiving Drawer!');
