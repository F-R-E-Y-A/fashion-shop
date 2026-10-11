#!/bin/sh
# Ap migration roi moi khoi dong. Migration that bai thi container dung ngay, khong chay API tren luoc do lech.
set -e

echo "[entrypoint] prisma migrate deploy ..."
npx prisma migrate deploy

# Seed tuy chon chi upsert danh muc va bang tra cuu; san pham phai import rieng.
# Khong bat seed lap lai tren moi truong production.
if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "[entrypoint] SEED_ON_START=true, nap danh muc va bang tra cuu ..."
  npx prisma db seed
fi

echo "[entrypoint] khoi dong API (${APP_VERSION:-?} / ${GIT_SHA:-?})"
exec node dist/main.js
