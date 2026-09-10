FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/package.json
COPY server/package.json server/package.json
RUN npm ci --no-audit --no-fund
COPY . .
RUN npx prisma generate --schema=server/prisma/schema.prisma && npm run build
ENV NODE_ENV=production HOST=0.0.0.0 PORT=10000 DATABASE_URL=file:/var/data/questions.db CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1
EXPOSE 10000
CMD ["node", "scripts/cloud-start.mjs"]
