# syntax=docker/dockerfile:1.7
# Image may chu API. Build tu GOC kho ma (can package-lock.json chung):
#   docker build -f apps/api/Dockerfile -t fashion-shop-api --build-arg GIT_SHA=$(git rev-parse HEAD) .
# Bon tang: deps (moi goi) -> build (bien dich) ; prod-deps (goi chay that) -> runtime (image cuoi).
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS base
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false CI=true

# ---- deps: cai goi cua workspace api, tan dung cache theo lockfile ----
FROM base AS deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/api --ignore-scripts

# ---- build: sinh Prisma Client va bien dich TypeScript ----
FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/api ./apps/api
# prisma generate doc prisma.config.ts, tep nay doi DATABASE_URL luc nap nhung KHONG ket noi: gia tri gia la du.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npm run db:generate -w apps/api && npm run build -w apps/api

# ---- prod-deps: chi goi can luc chay (prisma CLI nam trong dependencies de chay migrate deploy) ----
FROM base AS prod-deps
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/api --omit=dev --ignore-scripts && mkdir -p apps/api/node_modules

# ---- runtime ----
FROM base AS runtime
ARG APP_VERSION=0.0.0
ARG GIT_SHA=unknown
ENV NODE_ENV=production APP_VERSION=${APP_VERSION} GIT_SHA=${GIT_SHA} PORT=3001

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
# Prisma Client sinh ra o src/generated, va tep seed tro thang vao duong dan do.
# Khong chep thi SEED_ON_START se loi khong tim thay module.
COPY --from=build /app/apps/api/src/generated ./apps/api/src/generated
COPY apps/api/prisma ./apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/package.json ./apps/api/
COPY package.json ./
COPY apps/api/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && chown -R node:node /app

USER node
WORKDIR /app/apps/api
EXPOSE 3001

# Docker va nen tang trien khai doc duong dan nay; cd-staging.yml doi gitSha khop roi moi smoke test.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/healthz" >/dev/null || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
