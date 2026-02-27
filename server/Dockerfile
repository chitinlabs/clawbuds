FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace config
COPY package.json package-lock.json ./

# Copy all workspace package.jsons (required for npm ci with workspaces)
COPY server/package.json server/
COPY skill/package.json skill/
COPY skill/scripts/postinstall.js skill/scripts/
COPY web/package.json web/
COPY web-admin/package.json web-admin/

RUN npm ci

# Copy source
COPY server/ server/
COPY tsconfig.base.json ./

# Build
RUN cd server && npm run build

# Production
FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/server/package.json server/
COPY --from=builder /app/skill/package.json skill/
COPY --from=builder /app/web/package.json web/
COPY --from=builder /app/web-admin/package.json web-admin/

# Only install server's production deps
RUN npm ci --omit=dev --workspace=server

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
