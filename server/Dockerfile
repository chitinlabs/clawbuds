FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace config
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/

RUN npm ci

# Copy source
COPY shared/ shared/
COPY server/ server/
COPY tsconfig.base.json ./

# Build
RUN npm run build -w shared && npm run build -w server

# Production
FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/shared/package.json shared/
COPY --from=builder /app/server/package.json server/

RUN npm ci --omit=dev

COPY --from=builder /app/shared/dist/ shared/dist/
COPY --from=builder /app/server/dist/ server/dist/

# Copy SQL migrations (not included in TypeScript compilation)
COPY --from=builder /app/server/src/db/migrations/ server/dist/db/migrations/

# Create data and uploads directories
RUN mkdir -p /data /uploads

ENV NODE_ENV=production
ENV DATABASE_PATH=/data/clawbuds.db
ENV UPLOAD_DIR=/uploads
EXPOSE 3000

CMD ["node", "server/dist/index.js"]
