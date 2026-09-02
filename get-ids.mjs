import { PrismaClient } from './packages/database/node_modules/@prisma/client/index.js';

const prisma = new PrismaClient();

async function run() {
  const tenant = await prisma.tenant.findFirst();
  const client = await prisma.client.findFirst({ where: { accountNumber: 'CUST-884' } });
  
  console.log('\n----------------------------------------');
  console.log('TENANT_ID:', tenant?.id);
  console.log('CLIENT_ID:', client?.id);
  console.log('----------------------------------------\n');
  
  await prisma.$disconnect();
}

run().catch(console.error);
