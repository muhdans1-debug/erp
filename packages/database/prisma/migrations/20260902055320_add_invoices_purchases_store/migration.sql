/*
  Warnings:

  - You are about to alter the column `currentDue` on the `Customer` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `amount` on the `Transaction` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.

*/
-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('CASH', 'UPI', 'CREDIT');

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "currentDue" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Transaction" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "customerId" TEXT,
    "partyName" TEXT NOT NULL,
    "partyPhone" TEXT,
    "itemsJson" TEXT NOT NULL,
    "subtotal" DECIMAL(12,2) NOT NULL,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "grandTotal" DECIMAL(12,2) NOT NULL,
    "paymentType" "PaymentType" NOT NULL DEFAULT 'CASH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "billNo" TEXT NOT NULL,
    "vendorName" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "paymentMode" "PaymentType" NOT NULL DEFAULT 'CASH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreProfile" (
    "id" TEXT NOT NULL DEFAULT 'default-store',
    "name" TEXT NOT NULL DEFAULT 'LAYALI LUXURY PERFUMES & ATTIRE',
    "phone" TEXT NOT NULL DEFAULT '+91 98765 43210',
    "address" TEXT NOT NULL DEFAULT 'City Center Mall, Ground Floor',
    "gstin" TEXT DEFAULT '32AAAAA0000A1Z5',
    "upiId" TEXT DEFAULT 'layali@upi',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNo_key" ON "Invoice"("invoiceNo");

-- CreateIndex
CREATE INDEX "Invoice_invoiceNo_idx" ON "Invoice"("invoiceNo");

-- CreateIndex
CREATE INDEX "Invoice_createdAt_idx" ON "Invoice"("createdAt");

-- CreateIndex
CREATE INDEX "Purchase_vendorName_idx" ON "Purchase"("vendorName");

-- CreateIndex
CREATE INDEX "Purchase_createdAt_idx" ON "Purchase"("createdAt");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "Transaction_customerId_idx" ON "Transaction"("customerId");

-- CreateIndex
CREATE INDEX "Transaction_createdAt_idx" ON "Transaction"("createdAt");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
