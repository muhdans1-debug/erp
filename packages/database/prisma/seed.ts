import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Khatabook sample customers...');

  // Create Sample Customer 1
  const rahul = await prisma.customer.create({
    data: {
      name: 'Rahul Sharma',
      phone: '9876543210',
      address: 'Shop #12, Market Road',
      currentDue: 1450.00,
      transactions: {
        create: [
          {
            type: 'YOU_GAVE',
            amount: 2000.00,
            note: 'Monthly ration & groceries',
          },
          {
            type: 'YOU_GOT',
            amount: 550.00,
            note: 'GPay payment',
          },
        ],
      },
    },
  });

  // Create Sample Customer 2
  const priya = await prisma.customer.create({
    data: {
      name: 'Priya Patel',
      phone: '9123456780',
      address: 'A-204 Green Heights',
      currentDue: 350.00,
      transactions: {
        create: [
          {
            type: 'YOU_GAVE',
            amount: 350.00,
            note: 'Cosmetics & toiletries',
          },
        ],
      },
    },
  });

  console.log(`✅ Khatabook seeded with customers: ${rahul.name}, ${priya.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });