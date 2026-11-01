import { definePrismaConfig } from "prisma/config";
import { defineConfig as ormConfig } from "@prisma/orm-sqlite/config";

export default definePrismaConfig({
  orm: ormConfig({
    contract: "./prisma/contract.prisma", // This sets your schema path
    db: {
      connection: "file:./dev.db",       // The local database file path
    },
  }),
  skills: {
    agents: ["claude", "cursor", "agents", "devin"],
  },
});
