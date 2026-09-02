FROM node:20-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPN_HOME:$PATH"
RUN corepack enable

WORKDIR /app
COPY . .

# Install dependencies, generate Prisma client, and build using TypeScript build mode (-b)
RUN pnpm install --ignore-scripts
RUN pnpm --filter @starline/database generate
RUN pnpm --filter @starline/api exec tsc -b

EXPOSE 8010
ENV PORT=8010

CMD ["node", "apps/api/dist/server.js"]