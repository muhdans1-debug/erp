import { PrismaClient } from './packages/database/node_modules/@prisma/client/index.js';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function run() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.error('No tenant found! Run your database seed/migrations first.');
    return;
  }

  const hashedPassword = await bcrypt.hash('password123', 10);

  const user = await prisma.user.upsert({
    where: { email: 'manager@starline.com' },
    update: {},
    create: {
      tenantId: tenant.id,
      email: 'manager@starline.com',
      password: hashedPassword,
      role: 'STORE_MANAGER'
    }
  });

  console.log('\n----------------------------------------');
  console.log('Test User Created Successfully!');
  console.log('Email: manager@starline.com');
  console.log('Password: password123');
  console.log('Role:', user.role);
  console.log('----------------------------------------\n');

  await prisma.$disconnect();
}

run().catch(console.error);