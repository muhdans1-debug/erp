FROM node:20-alpine AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app
COPY . .

RUN pnpm install --ignore-scripts
RUN pnpm --filter @starline/database generate
RUN pnpm --filter @starline/api build

EXPOSE 8010
ENV PORT=8010

CMD ["pnpm", "--filter", "@starline/api", "start"]
