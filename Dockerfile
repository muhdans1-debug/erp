FROM node:20-alpine

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app
COPY . .

# Install dependencies, generate Prisma client, and build the API
RUN pnpm install --ignore-scripts
RUN pnpm --filter @starline/database generate
RUN pnpm --filter @starline/api build

EXPOSE 8010
ENV PORT=8010

# Directly execute the compiled JavaScript bundle
CMD ["node", "apps/api/dist/server.js"]