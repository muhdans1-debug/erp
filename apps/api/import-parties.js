const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const partiesToImport = [
  { name: 'Ahmed Al-Mahmoud', phone: '39111222', address: 'Manama' },
  { name: 'Fatima Trading', phone: '39333444', address: 'Muharraq' },
];

async function bulkImport() {
  console.log('Connecting to Railway database...');

  for (const party of partiesToImport) {
    try {
      const customer = await prisma.customer.create({
        data: {
          name: party.name,
          phone: party.phone,
          address: party.address,
          currentDue: 0.0,
        },
      });
      console.log(`Successfully inserted: ${customer.name}`);
    } catch (err) {
      console.error(`Failed to add ${party.name}:`, err.message);
    }
  }

  await prisma.$disconnect();
  console.log('Bulk import complete!');
}

bulkImport();