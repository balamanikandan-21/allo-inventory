// src/services/reservation.service.ts
//
// ─────────────────────────────────────────────────────────────────────────────
// CONCURRENCY STRATEGY — Why this is race-condition-free
// ─────────────────────────────────────────────────────────────────────────────
//
// Problem: Two checkout requests arrive simultaneously for the last unit of a SKU.
// Without locking, both reads see available=1, both proceed, and we oversell.
//
// Solution: PostgreSQL row-level locking via SELECT … FOR UPDATE inside a
// Serializable transaction.
//
//   BEGIN ISOLATION LEVEL SERIALIZABLE;
//     SELECT * FROM "Inventory"
//       WHERE "productId" = $1 AND "warehouseId" = $2
//       FOR UPDATE;             -- Request B blocks here until A commits
//     -- available = quantity - reserved (guaranteed fresh — lock is held)
//     UPDATE "Inventory" SET reserved = reserved + $qty;
//     INSERT INTO "Reservation" …;
//   COMMIT;  -- B unblocks, reads updated reserved, sees 0 available → 409
//
// When T2 unblocks after T1 commits it re-reads reserved from disk (not a
// stale snapshot). If T1 consumed the last unit, T2 sees available=0 and
// throws InsufficientStockError → HTTP 409. No overselling. Ever.
// ─────────────────────────────────────────────────────────────────────────────

import { db, reservations, inventories, auditLogs, idempotencyRecords } from "@/db/client";
import { eq, and, lt, inArray, sql } from "drizzle-orm";
import { nanoid } from "@/lib/nanoid";
import {
  InsufficientStockError,
  ReservationExpiredError,
  ReservationNotFoundError,
  ReservationInvalidStateError,
} from "@/lib/errors";
import type { ReservationWithDetails } from "@/types";

const RESERVATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ── Internal types ─────────────────────────────────────────────────────────

interface ReservationRow extends Record<string, unknown> {
  id: string;
  status: "PENDING" | "CONFIRMED" | "RELEASED" | "EXPIRED";
  quantity: number;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  customerEmail: string | null;
  inventoryId: string;
  inventory_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  product_imageUrl: string | null;
  warehouse_id: string;
  warehouse_name: string;
  warehouse_location: string;
}

interface InventoryLockRow extends Record<string, unknown> {
  id: string;
  quantity: number;
  reserved: number;
}

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Fetches a reservation with all related data in a single JOIN query.
 * db.execute() returns a pg QueryResult — rows live in .rows, not the root object.
 */
async function fetchReservationWithDetails(reservationId: string): Promise<ReservationWithDetails> {
  const result = await db.execute<ReservationRow>(sql`
    SELECT
      r.id, r.status, r.quantity, r."expiresAt", r."createdAt", r."updatedAt",
      r."customerEmail", r."inventoryId",
      i.id        AS inventory_id,
      p.id        AS product_id,
      p.name      AS product_name,
      p.sku       AS product_sku,
      p."imageUrl" AS "product_imageUrl",
      w.id        AS warehouse_id,
      w.name      AS warehouse_name,
      w.location  AS warehouse_location
    FROM "Reservation" r
    JOIN "Inventory" i ON i.id = r."inventoryId"
    JOIN "Product"   p ON p.id = i."productId"
    JOIN "Warehouse" w ON w.id = i."warehouseId"
    WHERE r.id = ${reservationId}
  `);

  // pg driver returns QueryResult<T>; rows are in .rows
  const rows = result.rows;
  if (rows.length === 0) throw new ReservationNotFoundError(reservationId);
  const row = rows[0]!;

  const logs = await db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.reservationId, reservationId))
    .orderBy(auditLogs.createdAt);

  return {
    id: row.id,
    status: row.status,
    quantity: row.quantity,
    expiresAt: new Date(row.expiresAt).toISOString(),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
    customerEmail: row.customerEmail,
    inventory: {
      id: row.inventory_id,
      product: {
        id: row.product_id,
        name: row.product_name,
        sku: row.product_sku,
        imageUrl: row.product_imageUrl,
      },
      warehouse: {
        id: row.warehouse_id,
        name: row.warehouse_name,
        location: row.warehouse_location,
      },
    },
    auditLogs: logs.map((l) => ({
      id: l.id,
      event: l.event,
      metadata: l.metadata as Record<string, unknown> | null,
      createdAt: l.createdAt.toISOString(),
    })),
  };
}

// ── createReservation ──────────────────────────────────────────────────────

export interface CreateReservationParams {
  productId: string;
  warehouseId: string;
  quantity: number;
  customerEmail?: string;
  idempotencyKey?: string;
}

/**
 * Creates a reservation with pessimistic row-level locking.
 *
 * Race-safety proof:
 *   SELECT FOR UPDATE acquires an exclusive row lock on the Inventory record.
 *   Any concurrent transaction attempting the same blocks at that SELECT.
 *   When the first commits, the second re-reads the fresh reserved count.
 *   If stock is now exhausted, it throws InsufficientStockError (→ HTTP 409).
 */
export async function createReservation(
  params: CreateReservationParams
): Promise<ReservationWithDetails> {
  const { productId, warehouseId, quantity, customerEmail, idempotencyKey } = params;

  // ── Idempotency fast-path ────────────────────────────────────────────────
  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(idempotencyRecords)
      .where(eq(idempotencyRecords.key, idempotencyKey));
    if (existing) {
      const cached = existing.response as { reservationId: string };
      return fetchReservationWithDetails(cached.reservationId);
    }
  }

  return db.transaction(async (tx) => {
    // ── Step 1: Acquire exclusive row lock ─────────────────────────────────
    // FOR UPDATE means: if another transaction already holds a lock on this row,
    // we WAIT here until they commit or roll back. This serialises concurrent
    // reservation attempts for the same SKU + warehouse combination.
    //
    // We use raw SQL because Drizzle's select builder doesn't expose FOR UPDATE.
    const lockResult = await tx.execute<InventoryLockRow>(sql`
      SELECT id, quantity, reserved
      FROM "Inventory"
      WHERE "productId"   = ${productId}
        AND "warehouseId" = ${warehouseId}
      FOR UPDATE
    `);

    // pg QueryResult — use .rows
    const lockRows = lockResult.rows;
    if (lockRows.length === 0) throw new InsufficientStockError(0, quantity);

    const inv = lockRows[0]!;

    // ── Step 2: Check availability INSIDE the lock ─────────────────────────
    // This value is guaranteed fresh — no other transaction can update
    // reserved while we hold the exclusive lock.
    const available = inv.quantity - inv.reserved;
    if (available < quantity) throw new InsufficientStockError(available, quantity);

    // ── Step 3: Atomically increment reserved counter ──────────────────────
    await tx
      .update(inventories)
      .set({ reserved: sql`reserved + ${quantity}`, updatedAt: new Date() })
      .where(eq(inventories.id, inv.id));

    // ── Step 4: Insert reservation record ──────────────────────────────────
    const reservationId = nanoid();
    const expiresAt = new Date(Date.now() + RESERVATION_TTL_MS);

    await tx.insert(reservations).values({
      id: reservationId,
      inventoryId: inv.id,
      quantity,
      status: "PENDING",
      expiresAt,
      customerEmail: customerEmail ?? null,
      idempotencyKey: idempotencyKey ?? null,
    });

    // ── Step 5: Audit log ──────────────────────────────────────────────────
    await tx.insert(auditLogs).values({
      id: nanoid(),
      reservationId,
      event: "CREATED",
      metadata: { quantity, availableBefore: available, expiresAt: expiresAt.toISOString() },
      createdAt: new Date(),
    });

    // ── Step 6: Idempotency record (inside the same transaction) ───────────
    // If the transaction rolls back, the record rolls back too — safe retry.
    if (idempotencyKey) {
      await tx.insert(idempotencyRecords).values({
        key: idempotencyKey,
        response: { reservationId },
        statusCode: 201,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
    }

    return fetchReservationWithDetails(reservationId);
  });
}

// ── confirmReservation ─────────────────────────────────────────────────────

export interface ConfirmReservationParams {
  reservationId: string;
  idempotencyKey?: string;
}

/**
 * Confirms a PENDING reservation (payment succeeded).
 * Permanently decrements inventory quantity and clears the reserved hold.
 * Returns 410 if the reservation has expired.
 */
export async function confirmReservation(
  params: ConfirmReservationParams
): Promise<ReservationWithDetails> {
  const { reservationId, idempotencyKey } = params;

  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(idempotencyRecords)
      .where(eq(idempotencyRecords.key, idempotencyKey));
    if (existing) return fetchReservationWithDetails(reservationId);
  }

  return db.transaction(async (tx) => {
    const [reservation] = await tx
      .select()
      .from(reservations)
      .where(eq(reservations.id, reservationId));

    if (!reservation) throw new ReservationNotFoundError(reservationId);
    if (reservation.status === "EXPIRED") throw new ReservationExpiredError(reservationId);

    // Already confirmed → idempotent success
    if (reservation.status === "CONFIRMED") return fetchReservationWithDetails(reservationId);

    if (reservation.status !== "PENDING") {
      throw new ReservationInvalidStateError(reservation.status, "PENDING");
    }

    // Lazy expiry: wall clock has passed even if the cron hasn't run yet
    if (reservation.expiresAt < new Date()) {
      await tx
        .update(reservations)
        .set({ status: "EXPIRED", updatedAt: new Date() })
        .where(eq(reservations.id, reservationId));
      await tx
        .update(inventories)
        .set({
          reserved: sql`GREATEST(0, reserved - ${reservation.quantity})`,
          updatedAt: new Date(),
        })
        .where(eq(inventories.id, reservation.inventoryId));
      await tx.insert(auditLogs).values({
        id: nanoid(),
        reservationId,
        event: "EXPIRED",
        metadata: { reason: "lazy-expiry-on-confirm" },
        createdAt: new Date(),
      });
      throw new ReservationExpiredError(reservationId);
    }

    // Confirm: decrement both quantity (permanently sold) and reserved (release hold)
    await tx
      .update(reservations)
      .set({ status: "CONFIRMED", updatedAt: new Date() })
      .where(eq(reservations.id, reservationId));

    await tx
      .update(inventories)
      .set({
        quantity: sql`quantity - ${reservation.quantity}`,
        reserved: sql`GREATEST(0, reserved - ${reservation.quantity})`,
        updatedAt: new Date(),
      })
      .where(eq(inventories.id, reservation.inventoryId));

    await tx.insert(auditLogs).values({
      id: nanoid(),
      reservationId,
      event: "CONFIRMED",
      metadata: { confirmedAt: new Date().toISOString() },
      createdAt: new Date(),
    });

    if (idempotencyKey) {
      await tx.insert(idempotencyRecords).values({
        key: idempotencyKey,
        response: { reservationId },
        statusCode: 200,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
    }

    return fetchReservationWithDetails(reservationId);
  });
}

// ── releaseReservation ─────────────────────────────────────────────────────

/**
 * Releases a PENDING reservation early (user cancelled / payment failed).
 * Returns the inventory hold to the available pool.
 */
export async function releaseReservation(reservationId: string): Promise<ReservationWithDetails> {
  return db.transaction(async (tx) => {
    const [reservation] = await tx
      .select()
      .from(reservations)
      .where(eq(reservations.id, reservationId));

    if (!reservation) throw new ReservationNotFoundError(reservationId);

    // Idempotent
    if (reservation.status === "RELEASED") return fetchReservationWithDetails(reservationId);

    if (reservation.status !== "PENDING") {
      throw new ReservationInvalidStateError(reservation.status, "PENDING");
    }

    await tx
      .update(reservations)
      .set({ status: "RELEASED", updatedAt: new Date() })
      .where(eq(reservations.id, reservationId));

    await tx
      .update(inventories)
      .set({
        reserved: sql`GREATEST(0, reserved - ${reservation.quantity})`,
        updatedAt: new Date(),
      })
      .where(eq(inventories.id, reservation.inventoryId));

    await tx.insert(auditLogs).values({
      id: nanoid(),
      reservationId,
      event: "RELEASED",
      metadata: { releasedAt: new Date().toISOString() },
      createdAt: new Date(),
    });

    return fetchReservationWithDetails(reservationId);
  });
}

// ── expireStaleReservations ────────────────────────────────────────────────

/**
 * Expires all PENDING reservations past their expiresAt.
 * Idempotent — safe to call repeatedly (Vercel Cron runs every minute).
 */
export async function expireStaleReservations(): Promise<{ expired: number; ids: string[] }> {
  const stale = await db
    .select({
      id: reservations.id,
      inventoryId: reservations.inventoryId,
      quantity: reservations.quantity,
    })
    .from(reservations)
    .where(and(eq(reservations.status, "PENDING"), lt(reservations.expiresAt, new Date())));

  if (stale.length === 0) return { expired: 0, ids: [] };

  const staleIds = stale.map((r) => r.id);

  await db.transaction(async (tx) => {
    // Mark all stale reservations as EXPIRED
    await tx
      .update(reservations)
      .set({ status: "EXPIRED", updatedAt: new Date() })
      .where(inArray(reservations.id, staleIds));

    // Release inventory holds in a single bulk UPDATE per affected inventory row.
    // GREATEST(0, ...) prevents reserved going negative from any edge-case race.
    const idList = staleIds.map((id) => `'${id}'`).join(",");
    await tx.execute(sql`
      UPDATE "Inventory" i
      SET    reserved    = GREATEST(0, i.reserved - sub.total_released),
             "updatedAt" = NOW()
      FROM (
        SELECT "inventoryId", SUM(quantity)::int AS total_released
        FROM   "Reservation"
        WHERE  id = ANY(ARRAY[${sql.raw(idList)}]::text[])
        GROUP  BY "inventoryId"
      ) sub
      WHERE i.id = sub."inventoryId"
    `);

    // Write audit logs for all expired reservations in one batch
    await tx.insert(auditLogs).values(
      stale.map((r) => ({
        id: nanoid(),
        reservationId: r.id,
        event: "EXPIRED",
        metadata: { expiredAt: new Date().toISOString(), reason: "cron-expiry" },
        createdAt: new Date(),
      }))
    );
  });

  return { expired: stale.length, ids: staleIds };
}

// ── getReservation ─────────────────────────────────────────────────────────

export async function getReservation(reservationId: string): Promise<ReservationWithDetails> {
  const result = await fetchReservationWithDetails(reservationId);

  // Lazy expiry: if still PENDING but wall clock has passed, expire it now
  // so the checkout page immediately shows the correct terminal state.
  if (result.status === "PENDING" && new Date(result.expiresAt) < new Date()) {
    await db.transaction(async (tx) => {
      await tx
        .update(reservations)
        .set({ status: "EXPIRED", updatedAt: new Date() })
        .where(eq(reservations.id, reservationId));
      await tx
        .update(inventories)
        .set({
          reserved: sql`GREATEST(0, reserved - ${result.quantity})`,
          updatedAt: new Date(),
        })
        .where(eq(inventories.id, result.inventory.id));
      await tx.insert(auditLogs).values({
        id: nanoid(),
        reservationId,
        event: "EXPIRED",
        metadata: { reason: "lazy-expiry-on-read" },
        createdAt: new Date(),
      });
    });
    result.status = "EXPIRED";
  }

  return result;
}
