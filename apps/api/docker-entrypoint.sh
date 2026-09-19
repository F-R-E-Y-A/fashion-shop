#!/bin/sh
# Ap migration roi moi khoi dong. Migration that bai thi container dung ngay, khong chay API tren luoc do lech.
set -e

echo "[entrypoint] prisma migrate deploy ..."
npx prisma migrate deploy

# Nap du lieu gia khi duoc yeu cau. Dung cho MOI TRUONG THU: co so du lieu moi tao thi trong rong,
# ma buoi trinh bay can co hang de xem. Seed dung upsert voi ma dinh danh co dinh nen chay lai
# bao nhieu lan cung ra cung mot bo du lieu. KHONG bat bien nay tren moi truong that.
if [ "${SEED_ON_START:-false}" = "true" ]; then
  echo "[entrypoint] SEED_ON_START=true, nap du lieu gia ..."
  npx prisma db seed
fi

echo "[entrypoint] khoi dong API (${APP_VERSION:-?} / ${GIT_SHA:-?})"
exec node dist/main.js
