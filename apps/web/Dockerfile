# syntax=docker/dockerfile:1.7
# Image giao dien web: dung tinh bang Vite roi phuc vu bang nginx.
# Build tu GOC kho ma:
#   docker build -f apps/web/Dockerfile --build-arg VITE_API_URL=https://.../api -t fashion-shop-web .
# Luu y: VITE_* duoc nhung vao ma luc BUILD, khong doc duoc luc chay. Doi dia chi API thi build lai image.
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-alpine AS build
WORKDIR /app
ENV NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false CI=true

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace apps/web --ignore-scripts

COPY tsconfig.base.json ./
COPY apps/web ./apps/web

ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build -w apps/web

FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
