-- Allo Inventory Reservation System — Initial Migration
-- Run with: psql $DATABASE_URL -f drizzle/migrations/0001_initial.sql
-- OR use: npm run db:push  (for development)
-- OR use: npm run db:migrate  (for production via drizzle-kit)

DO $$ BEGIN
  CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'RELEASED', 'EXPIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Product" (
  "id"          text PRIMARY KEY,
  "name"        text NOT NULL,
  "description" text,
  "sku"         text NOT NULL UNIQUE,
  "imageUrl"    text,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Product_sku_idx" ON "Product" ("sku");

CREATE TABLE IF NOT EXISTS "Warehouse" (
  "id"        text PRIMARY KEY,
  "name"      text NOT NULL,
  "location"  text NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "Inventory" (
  "id"          text PRIMARY KEY,
  "productId"   text NOT NULL REFERENCES "Product"("id"),
  "warehouseId" text NOT NULL REFERENCES "Warehouse"("id"),
  "quantity"    integer NOT NULL DEFAULT 0,
  "reserved"    integer NOT NULL DEFAULT 0,
  "createdAt"   timestamptz NOT NULL DEFAULT now(),
  "updatedAt"   timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("productId", "warehouseId")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Inventory_productId_warehouseId_key" ON "Inventory" ("productId", "warehouseId");
CREATE INDEX IF NOT EXISTS "Inventory_productId_idx"   ON "Inventory" ("productId");
CREATE INDEX IF NOT EXISTS "Inventory_warehouseId_idx" ON "Inventory" ("warehouseId");

CREATE TABLE IF NOT EXISTS "Reservation" (
  "id"             text PRIMARY KEY,
  "inventoryId"    text NOT NULL REFERENCES "Inventory"("id"),
  "quantity"       integer NOT NULL,
  "status"         "ReservationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt"      timestamptz NOT NULL,
  "customerEmail"  text,
  "idempotencyKey" text UNIQUE,
  "createdAt"      timestamptz NOT NULL DEFAULT now(),
  "updatedAt"      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "Reservation_status_expiresAt_idx"    ON "Reservation" ("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "Reservation_inventoryId_status_idx"  ON "Reservation" ("inventoryId", "status");
CREATE INDEX IF NOT EXISTS "Reservation_idempotencyKey_idx"      ON "Reservation" ("idempotencyKey");

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id"            text PRIMARY KEY,
  "reservationId" text NOT NULL REFERENCES "Reservation"("id"),
  "event"         text NOT NULL,
  "metadata"      jsonb,
  "createdAt"     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "AuditLog_reservationId_idx" ON "AuditLog" ("reservationId");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx"     ON "AuditLog" ("createdAt");

CREATE TABLE IF NOT EXISTS "IdempotencyRecord" (
  "key"        text PRIMARY KEY,
  "response"   jsonb NOT NULL,
  "statusCode" integer NOT NULL,
  "createdAt"  timestamptz NOT NULL DEFAULT now(),
  "expiresAt"  timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord" ("expiresAt");
