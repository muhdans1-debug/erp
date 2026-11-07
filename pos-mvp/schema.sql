-- ====================================================================
-- ASKAR SUPERMARKET ERP - NATIVE LIBSQL DATABASE SCHEMA
-- Single Source of Truth for Local Embedded Replica & Turso Cloud Sync
-- ====================================================================

-- 1. DISTRIBUTORS & SUPPLIERS
CREATE TABLE IF NOT EXISTS "Distributor" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL DEFAULT 'tenant_1',
  "name" TEXT NOT NULL UNIQUE,
  "whatsappNumber" TEXT NOT NULL DEFAULT '97339000000',
  "contactEmail" TEXT DEFAULT 'orders@supplier.bh',
  "minimumOrderValue" REAL NOT NULL DEFAULT 0.0,
  "deliveryDays" TEXT,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 2. PRODUCTS & INVENTORY
CREATE TABLE IF NOT EXISTS "Product" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL DEFAULT 'tenant_1',
  "name" TEXT NOT NULL,
  "purchasePrice" REAL NOT NULL,
  "unitCost" REAL NOT NULL DEFAULT 0.0,
  "sellingPrice" REAL NOT NULL,
  "stockQuantity" INTEGER NOT NULL DEFAULT 0,
  "minThreshold" INTEGER NOT NULL DEFAULT 20,
  "maxThreshold" INTEGER NOT NULL DEFAULT 100,
  "supplierName" TEXT DEFAULT 'Local Distributor',
  "supplierEmail" TEXT DEFAULT 'supplier@askar.bh',
  "distributorId" TEXT,
  "taxRate" REAL NOT NULL DEFAULT 0.10,
  "vatRate" REAL NOT NULL DEFAULT 10.0,
  "barcode" TEXT,
  "category" TEXT DEFAULT 'GROCERY',
  "is_weighed_item" INTEGER DEFAULT 0,
  "updatedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY ("distributorId") REFERENCES "Distributor" ("id")
);

CREATE INDEX IF NOT EXISTS "idx_product_barcode" ON "Product" ("barcode");
CREATE INDEX IF NOT EXISTS "idx_product_distributor" ON "Product" ("distributorId");

-- 3. CUSTOMERS & KHATA (CREDIT)
CREATE TABLE IF NOT EXISTS "Customer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL DEFAULT 'tenant_1',
  "name" TEXT NOT NULL,
  "phone" TEXT,
  "cpr" TEXT,
  "batchNo" TEXT,
  "description" TEXT,
  "cardUid" TEXT UNIQUE,
  "createdAt" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "is_active" INTEGER NOT NULL DEFAULT 1,
  "isActive" INTEGER NOT NULL DEFAULT 1,
  "mess_id" TEXT,
  "balance" REAL DEFAULT 0.0,
  "khata_pin" TEXT DEFAULT '0000',
  "pin" TEXT DEFAULT '1234',
  "access_token" TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS "idx_customer_phone" ON "Customer" ("phone");
CREATE INDEX IF NOT EXISTS "idx_customer_cpr" ON "Customer" ("cpr");
CREATE INDEX IF NOT EXISTS "idx_customer_card" ON "Customer" ("cardUid");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_customer_access_token" ON "Customer" ("access_token");

-- Compatibility VIEW for legacy queries referencing KhataCustomer
CREATE VIEW IF NOT EXISTS "KhataCustomer" AS
SELECT 
  id,
  access_token,
  name,
  balance,
  phone,
  COALESCE(pin, khata_pin, '1234') AS pin,
  mess_id,
  createdAt AS updatedAt
FROM Customer;

CREATE TABLE IF NOT EXISTS "KhataLedger" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL DEFAULT 'tenant_1',
  "customerId" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "type" TEXT NOT NULL,
  "running_balance" REAL DEFAULT 0.0,
  "reference" TEXT,
  "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "timestamp" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "created_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY ("customerId") REFERENCES "Customer" ("id")
);

CREATE INDEX IF NOT EXISTS "idx_ledger_customer" ON "KhataLedger" ("customerId");
CREATE INDEX IF NOT EXISTS "idx_khataledger_customer" ON "KhataLedger" ("customerId");

-- 4. MESS GROUPS & NFC CARDS
CREATE TABLE IF NOT EXISTS "MessGroup" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL DEFAULT 'tenant_1',
  "group_name" TEXT NOT NULL,
  "createdAt" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "NfcCard" (
  "tag_id" TEXT PRIMARY KEY,
  "card_type" TEXT NOT NULL DEFAULT 'PERSONAL',
  "customer_id" TEXT,
  "mess_id" TEXT,
  "createdAt" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY ("customer_id") REFERENCES "Customer" ("id"),
  FOREIGN KEY ("mess_id") REFERENCES "MessGroup" ("id")
);

-- 5. EMPLOYEES & SHIFTS
CREATE TABLE IF NOT EXISTS "Employee" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT DEFAULT 'tenant_1',
  "name" TEXT NOT NULL,
  "pin_code" TEXT UNIQUE NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'CASHIER',
  "is_active" INTEGER DEFAULT 1,
  "createdAt" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "ShiftSession" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT DEFAULT 'tenant_1',
  "employee_id" TEXT NOT NULL,
  "opened_at" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "closed_at" TEXT,
  "starting_cash" REAL NOT NULL DEFAULT 0.0,
  "expected_cash" REAL,
  "actual_cash" REAL,
  "variance" REAL,
  "denominations" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  FOREIGN KEY ("employee_id") REFERENCES "Employee" ("id")
);

CREATE TABLE IF NOT EXISTS "Shift" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL DEFAULT 'tenant_1',
  "cashierName" TEXT NOT NULL,
  "openingCash" REAL NOT NULL DEFAULT 50.0,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "openedAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  "closedAt" TEXT,
  "closingCash" REAL,
  "notes" TEXT
);

-- 6. SALES & NBR VAT INVOICING
CREATE TABLE IF NOT EXISTS "InvoiceSequence" (
  "name" TEXT NOT NULL PRIMARY KEY,
  "current_seq" INTEGER NOT NULL DEFAULT 4999
);

CREATE TABLE IF NOT EXISTS "Sale" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL DEFAULT 'tenant_1',
  "invoiceNo" TEXT NOT NULL UNIQUE,
  "invoiceSeq" INTEGER DEFAULT 0,
  "customerId" TEXT,
  "employeeId" TEXT,
  "shiftId" TEXT,
  "subtotal" REAL NOT NULL,
  "vatTotal" REAL NOT NULL DEFAULT 0.0,
  "totalVat" REAL NOT NULL DEFAULT 0.0,
  "total" REAL NOT NULL,
  "totalAmount" REAL NOT NULL DEFAULT 0.0,
  "paymentType" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "syncStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY ("customerId") REFERENCES "Customer" ("id")
);

CREATE INDEX IF NOT EXISTS "idx_sale_invoice" ON "Sale" ("invoiceNo");
CREATE INDEX IF NOT EXISTS "idx_sale_created" ON "Sale" ("createdAt");
CREATE INDEX IF NOT EXISTS "idx_sale_shift" ON "Sale" ("shiftId");

CREATE TABLE IF NOT EXISTS "SaleItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL DEFAULT 'tenant_1',
  "saleId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" REAL NOT NULL,
  "priceAtSale" REAL NOT NULL,
  "costAtSale" REAL NOT NULL DEFAULT 0.0,
  "vatRateAtSale" REAL NOT NULL DEFAULT 10.0,
  "vatAmount" REAL NOT NULL DEFAULT 0.0,
  "total_price" REAL,
  FOREIGN KEY ("saleId") REFERENCES "Sale" ("id"),
  FOREIGN KEY ("productId") REFERENCES "Product" ("id")
);

CREATE INDEX IF NOT EXISTS "idx_sale_item_sale" ON "SaleItem" ("saleId");
CREATE INDEX IF NOT EXISTS "idx_sale_item_product" ON "SaleItem" ("productId");

-- 7. REFUNDS & RETURNS
CREATE TABLE IF NOT EXISTS "Refund" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL DEFAULT 'tenant_1',
  "saleId" TEXT NOT NULL,
  "invoiceNo" TEXT NOT NULL,
  "refundedAmount" REAL NOT NULL,
  "reason" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "itemsJson" TEXT,
  "processedBy" TEXT NOT NULL DEFAULT 'Cashier',
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY ("saleId") REFERENCES "Sale" ("id")
);

CREATE TABLE IF NOT EXISTS "RefundItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL DEFAULT 'tenant_1',
  "refundId" TEXT NOT NULL,
  "saleItemId" TEXT,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitPrice" REAL NOT NULL,
  "totalAmount" REAL NOT NULL,
  "isDamaged" INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY ("refundId") REFERENCES "Refund" ("id"),
  FOREIGN KEY ("saleItemId") REFERENCES "SaleItem" ("id")
);

-- 8. PURCHASE ORDERS & LOGISTICS
CREATE TABLE IF NOT EXISTS "PurchaseOrder" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL DEFAULT 'tenant_1',
  "distributorId" TEXT,
  "supplierName" TEXT NOT NULL,
  "whatsappNumber" TEXT DEFAULT '97339000000',
  "supplierEmail" TEXT DEFAULT 'supplier@askar.bh',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "estimatedCost" REAL NOT NULL,
  "vatPaid" REAL NOT NULL DEFAULT 0.0,
  "itemsJson" TEXT NOT NULL,
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY ("distributorId") REFERENCES "Distributor" ("id")
);

-- 9. EXPENSES & WASTAGE
CREATE TABLE IF NOT EXISTS "Expense" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL DEFAULT 'tenant_1',
  "type" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "amount" REAL NOT NULL,
  "vatPaid" REAL NOT NULL DEFAULT 0.0,
  "description" TEXT,
  "recordedBy" TEXT NOT NULL DEFAULT 'Admin',
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS "WastageLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL DEFAULT 'tenant_1',
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "unitCost" REAL NOT NULL,
  "totalLoss" REAL NOT NULL,
  "reason" TEXT NOT NULL,
  "loggedBy" TEXT NOT NULL DEFAULT 'Admin',
  "createdAt" TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  FOREIGN KEY ("productId") REFERENCES "Product" ("id")
);

-- 10. PRICE AUDIT HISTORY
CREATE TABLE IF NOT EXISTS "ProductPriceHistory" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT DEFAULT 'tenant_askar_01',
  "productId" TEXT NOT NULL,
  "productName" TEXT,
  "oldPrice" REAL NOT NULL,
  "newPrice" REAL NOT NULL,
  "oldCost" REAL,
  "newCost" REAL,
  "changeReason" TEXT,
  "changedBy" TEXT DEFAULT 'Manager',
  "createdAt" TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 11. COMPATIBILITY VIEWS & TRIGGERS (Supports legacy queries seamlessly)
CREATE VIEW IF NOT EXISTS "Sales" AS 
SELECT 
  id,
  invoiceNo AS invoice_number,
  total,
  paymentType AS payment_type,
  status,
  employeeId AS employee_id,
  shiftId AS shift_id,
  customerId AS khata_id,
  createdAt AS created_at
FROM Sale;

CREATE TRIGGER IF NOT EXISTS "sales_insert_trigger"
INSTEAD OF INSERT ON "Sales"
BEGIN
  INSERT INTO Sale (id, invoiceNo, total, subtotal, paymentType, status, shiftId, createdAt)
  VALUES (
    NEW.id,
    NEW.invoice_number,
    NEW.total,
    COALESCE(NEW.total, 0),
    NEW.payment_type,
    NEW.status,
    NEW.shift_id,
    datetime('now')
  );
END;

CREATE TRIGGER IF NOT EXISTS "sales_update_trigger"
INSTEAD OF UPDATE ON "Sales"
BEGIN
  UPDATE Sale
  SET status = NEW.status
  WHERE invoiceNo = NEW.invoice_number OR id = NEW.id;
END;

