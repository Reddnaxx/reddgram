FROM oven/bun:1

WORKDIR /app

COPY package.json bun.lock ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN bun install --frozen-lockfile

COPY . .

RUN bun run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["sh", "-c", "bunx prisma migrate deploy && bun dist/src/main.js"]
