const fs = require('fs');

let content = fs.readFileSync('./prisma/contract.prisma', 'utf8').trim();

const modelDef = `

model ProductPriceHistory {
  id           String   @id
  tenantId     String   @default("tenant_1")
  productId    String
  productName  String?
  oldPrice     Float
  newPrice     Float
  oldCost      Float?
  newCost      Float?
  changeReason String?
  changedBy    String   @default("Manager")
  createdAt    DateTime @default(now())
}
`;

fs.writeFileSync('./prisma/contract.prisma', content + modelDef, 'utf8');
console.log('✅ contract.prisma updated');
