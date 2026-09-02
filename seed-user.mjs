import { PrismaClient } from './packages/database/node_modules/@prisma/client/index.js';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function run() {
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.error('No tenant found!');
    return;
  }

  const hashedPassword = await bcrypt.hash('password123', 10);

  const user = await prisma.user.upsert({
    where: { email: 'manager@starline.com' },
    update: { password: hashedPassword },
    create: {
      tenantId: tenant.id,
      email: 'manager@starline.com',
      password: hashedPassword,
      role: 'STORE_MANAGER'
    }
  });

  console.log('Test User Created Successfully!');
  await prisma.$disconnect();
}

run().catch(console.error);
