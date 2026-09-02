const { PrismaClient } = require('../../packages/database/node_modules/@prisma/client');
const prisma = new PrismaClient();

const partiesToImport = [
  { name: "RAJA NASS", phone: "36852095", address: "RAJA NASS", openingBalance: 2.500 },
  { name: "MOINE", phone: "35067064", address: "MOINE Bahrain", openingBalance: 2.850 },
  { name: "HARVINDER MESS", phone: "39538982", address: "HARVINDER MESS Bahrain", openingBalance: 6.525 },
  { name: "pappu", phone: "36241660", address: "pappu 27576", openingBalance: 7.527 },
  { name: "jrnail nass", phone: "38129187", address: "jrnail nass Bahrain", openingBalance: 6.900 },
  { name: "PARMESH", phone: "34454687", address: "PARMESH", openingBalance: 2.025 },
  { name: "SHARIFF NASS", phone: "38379817", address: "SHARIFF NASS", openingBalance: 0.000 },
  { name: "VENKATESH", phone: "00919963245367", address: "VENKATESH", openingBalance: 0.725 },
  { name: "NARENDAR", phone: "00919815213884", address: "NARENDAR 28825", openingBalance: 0.400 },
  { name: "shahid", phone: "34621780", address: "shahid", openingBalance: 3.975 },
  { name: "ARIF 147", phone: "33272580", address: "ARIF 147", openingBalance: 41.675 },
  { name: "AKBAR ZAMAN", phone: "39495325", address: "AKBAR ZAMAN", openingBalance: 1.500 }
];

async function runDirectImport() {
  console.log(`Starting direct database import of ${partiesToImport.length} parties...`);

  for (const party of partiesToImport) {
    try {
      const res = await prisma.customer.create({
        data: {
          name: party.name,
          phone: party.phone || '39000000',
          address: party.address,
          currentDue: party.openingBalance
        }
      });
      console.log(`[Success] Inserted to DB: ${res.name}`);
    } catch (err) {
      console.error(`[Failed] ${party.name}:`, err.message);
    }
  }

  await prisma.$disconnect();
  console.log('Database import completed successfully!');
}

runDirectImport();