-- AlterTable shipments: add carrier_name column (nullable, varchar)
ALTER TABLE "shipments" ADD COLUMN "carrier_name" VARCHAR(100);
