import { PrismaClient, Role } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding initial ERP data...');

  // 1. Create Default Tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'starline-main' },
    update: {},
    create: {
      name: 'Starline Retail HQ',
      slug: 'starline-main',
    },
  });

  // 2. Create POS Manager User
  await prisma.user.upsert({
    where: { email: 'manager@starline.local' },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'manager@starline.local',
      name: 'Alex Manager',
      passwordHash: 'argon2-hashed-placeholder',
      role: Role.STORE_MANAGER,
    },
  });

  // 3. Create Sample Client Account (CUST-884)
  const client = await prisma.client.upsert({
    where: { accountNumber: 'CUST-884' },
    update: {},
    create: {
      tenantId: tenant.id,
      accountNumber: 'CUST-884',
      name: 'Rahul K.',
      phone: '+919876543210',
      creditLimit: 1000.0,
    },
  });

  // 4. Seed Inventory Catalog
  const products = [
    { sku: 'BEV-001', name: 'Robusta Roast 1kg', category: 'Beverages', price: 14.5, costPrice: 8.0, stockQty: 42 },
    { sku: 'HME-012', name: 'Gas Cylinder Cover', category: 'Home', price: 6.2, costPrice: 3.0, stockQty: 18 },
    { sku: 'FUR-044', name: 'Office Desk Chair', category: 'Furniture', price: 89.0, costPrice: 50.0, stockQty: 6 },
    { sku: 'POS-002', name: 'Thermal Roll 80mm', category: 'Supplies', price: 1.5, costPrice: 0.8, stockQty: 120 },
  ];

  for (const prod of products) {
    await prisma.product.upsert({
      where: { sku: prod.sku },
      update: { stockQty: prod.stockQty, price: prod.price },
      create: { ...prod, tenantId: tenant.id },
    });
  }

  console.log(`Database seeded successfully! Tenant ID: ${tenant.id}, Client ID: ${client.id}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
