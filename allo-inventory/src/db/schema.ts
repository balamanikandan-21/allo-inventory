// src/db/schema.ts
// Drizzle ORM schema — matches the original Prisma design, zero native dependencies

import {
  pgTable,
  text,
  integer,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
  json,
} from "drizzle-orm/pg-core";

export const reservationStatusEnum = pgEnum("ReservationStatus", [
  "PENDING",
  "CONFIRMED",
  "RELEASED",
  "EXPIRED",
]);

export const products = pgTable(
  "Product",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    sku: text("sku").notNull().unique(),
    imageUrl: text("imageUrl"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("Product_sku_idx").on(t.sku)]
);

export const warehouses = pgTable("Warehouse", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  location: text("location").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export const inventories = pgTable(
  "Inventory",
  {
    id: text("id").primaryKey(),
    productId: text("productId")
      .notNull()
      .references(() => products.id),
    warehouseId: text("warehouseId")
      .notNull()
      .references(() => warehouses.id),
    quantity: integer("quantity").notNull().default(0),
    reserved: integer("reserved").notNull().default(0),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("Inventory_productId_warehouseId_key").on(t.productId, t.warehouseId),
    index("Inventory_productId_idx").on(t.productId),
    index("Inventory_warehouseId_idx").on(t.warehouseId),
  ]
);

export const reservations = pgTable(
  "Reservation",
  {
    id: text("id").primaryKey(),
    inventoryId: text("inventoryId")
      .notNull()
      .references(() => inventories.id),
    quantity: integer("quantity").notNull(),
    status: reservationStatusEnum("status").notNull().default("PENDING"),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
    customerEmail: text("customerEmail"),
    idempotencyKey: text("idempotencyKey").unique(),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("Reservation_status_expiresAt_idx").on(t.status, t.expiresAt),
    index("Reservation_inventoryId_status_idx").on(t.inventoryId, t.status),
    index("Reservation_idempotencyKey_idx").on(t.idempotencyKey),
  ]
);

export const auditLogs = pgTable(
  "AuditLog",
  {
    id: text("id").primaryKey(),
    reservationId: text("reservationId")
      .notNull()
      .references(() => reservations.id),
    event: text("event").notNull(),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("AuditLog_reservationId_idx").on(t.reservationId),
    index("AuditLog_createdAt_idx").on(t.createdAt),
  ]
);

export const idempotencyRecords = pgTable(
  "IdempotencyRecord",
  {
    key: text("key").primaryKey(),
    response: json("response").notNull(),
    statusCode: integer("statusCode").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expiresAt", { withTimezone: true }).notNull(),
  },
  (t) => [index("IdempotencyRecord_expiresAt_idx").on(t.expiresAt)]
);

// ── Inferred types ─────────────────────────────────────────────────────────

export type Product = typeof products.$inferSelect;
export type Warehouse = typeof warehouses.$inferSelect;
export type Inventory = typeof inventories.$inferSelect;
export type Reservation = typeof reservations.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type IdempotencyRecord = typeof idempotencyRecords.$inferSelect;
export type ReservationStatus = "PENDING" | "CONFIRMED" | "RELEASED" | "EXPIRED";
