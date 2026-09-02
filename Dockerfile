FROM node:20-alpine

RUN apk add --no-cache openssl

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app
COPY . .

RUN pnpm install
RUN pnpm --filter @starline/database generate
RUN pnpm build

EXPOSE 8010
ENV PORT=8010

CMD ["node", "apps/api/dist/server.js"]
