const fs = require('fs');

function updatePrisma(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  // 1. Add fields to Customer model if not present
  if (!content.includes('nfcCards')) {
    const customerTarget = 'model Customer {';
    const customerReplacement = 'model Customer {\n  nfcCards    NfcCard[]\n  mess_id     String?\n  messGroup   MessGroup?    @relation(fields: [mess_id], references: [id])';
    content = content.replace(customerTarget, customerReplacement);
  }
  
  // 2. Add NfcCard and MessGroup if not present
  if (!content.includes('model NfcCard')) {
    const newModels = `

model NfcCard {
  tag_id      String     @id
  card_type   String     // "PERSONAL" or "MESS"
  customer_id String?
  customer    Customer?  @relation(fields: [customer_id], references: [id])
  mess_id     String?
  mess        MessGroup? @relation(fields: [mess_id], references: [id])
  createdAt   DateTime   @default(now())
}

model MessGroup {
  id         String     @id @default(uuid())
  tenantId   String     @default("tenant_1")
  group_name String     // e.g., "Camp 4 Mess"
  nfcCards   NfcCard[]
  members    Customer[]
  createdAt  DateTime   @default(now())
}
`;
    content += newModels;
  }
  
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Updated:', filePath);
}

updatePrisma('prisma/contract.prisma');
updatePrisma('../contract.prisma');

