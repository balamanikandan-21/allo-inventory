// tests/reservation.test.ts
// Unit tests for the reservation service — no live DB required.
// Run: npm test

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── pg QueryResult helper ────────────────────────────────────────────────────
function pgResult<T>(rows: T[]) {
  return { rows, rowCount: rows.length, command: "SELECT", oid: 0, fields: [] };
}

/**
 * makeChain: a fully-chainable thenable mock.
 * - Binding .then/.catch/.finally to the underlying Promise (not the proxy)
 *   is required because native Promise methods check the `this` receiver.
 * - Every unknown property returns a no-op that returns the same proxy,
 *   so .from().where().orderBy() etc. all work transparently.
 */
function makeChain<T>(result: T) {
  const p = Promise.resolve(result);
  const thenable: Record<string | symbol, unknown> = {
    then:    p.then.bind(p),
    catch:   p.catch.bind(p),
    finally: p.finally.bind(p),
  };
  const proxy: Record<string | symbol, unknown> = new Proxy(thenable, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (..._args: unknown[]) => proxy;
    },
  });
  return proxy as unknown as T;
}

// ── DB mock setup ────────────────────────────────────────────────────────────
const mockExecute    = vi.fn();
const mockTransaction = vi.fn();
const mockSelect     = vi.fn();
const mockInsert     = vi.fn();
const mockUpdate     = vi.fn();

vi.mock("@/db/client", () => ({
  db: { execute: mockExecute, transaction: mockTransaction, select: mockSelect, insert: mockInsert, update: mockUpdate, delete: vi.fn() },
  products: {}, warehouses: {}, inventories: {}, reservations: {}, auditLogs: {}, idempotencyRecords: {},
}));

vi.mock("drizzle-orm", () => {
  const sqlTag = Object.assign(
    vi.fn((_strings: TemplateStringsArray, ..._vals: unknown[]) => ({ op: "sql" })),
    { raw: vi.fn((s: string) => s) }
  );
  return { eq: vi.fn(() => ({})), and: vi.fn(() => ({})), lt: vi.fn(() => ({})), inArray: vi.fn(() => ({})), sql: sqlTag, count: vi.fn(() => ({})), sum: vi.fn(() => ({})), desc: vi.fn(() => ({})) };
});

import { InsufficientStockError, ReservationExpiredError, ReservationNotFoundError, ReservationInvalidStateError } from "@/lib/errors";

// ── Fixtures ─────────────────────────────────────────────────────────────────
function makeInvRow(qty = 10, reserved = 0) {
  return { id: "inv_1", quantity: qty, reserved };
}

function makeReservation(status: "PENDING" | "CONFIRMED" | "RELEASED" | "EXPIRED" = "PENDING", minutesFromNow = 10) {
  return { id: "rsv_1", inventoryId: "inv_1", quantity: 1, status, expiresAt: new Date(Date.now() + minutesFromNow * 60_000), customerEmail: "test@example.com", idempotencyKey: null, createdAt: new Date(), updatedAt: new Date() };
}

function makeDetailRow(status = "PENDING") {
  return { id: "rsv_1", status, quantity: 1, inventoryId: "inv_1", expiresAt: new Date(Date.now() + 10 * 60_000), createdAt: new Date(), updatedAt: new Date(), customerEmail: null, inventory_id: "inv_1", product_id: "prod_1", product_name: "Scale", product_sku: "SKU", product_imageUrl: null, warehouse_id: "wh_1", warehouse_name: "Mumbai FC", warehouse_location: "Mumbai" };
}

/**
 * Sets up the two mock calls needed after a transaction completes:
 * 1. db.execute(SQL JOIN) → the reservation detail row
 * 2. db.select().from(auditLogs)... → empty audit log array
 */
function setupFetchDetail(status = "PENDING") {
  mockExecute.mockResolvedValueOnce(pgResult([makeDetailRow(status)]));
  mockSelect.mockImplementationOnce(() => makeChain([]));
}

/**
 * Builds a transaction `tx` stub for use inside mockTransaction.mockImplementation.
 * selectRows: each inner array is the result of one tx.select() call.
 * executeRows: each inner array is the result of one tx.execute() call (for FOR UPDATE).
 */
function makeTx(opts: { selectRows?: unknown[][]; executeRows?: unknown[][] } = {}) {
  let si = 0, ei = 0;
  return {
    select:  vi.fn(() => makeChain(opts.selectRows?.[si++] ?? [])),
    execute: vi.fn(() => Promise.resolve(pgResult(opts.executeRows?.[ei++] ?? []))),
    insert:  vi.fn(() => makeChain([])),
    update:  vi.fn(() => makeChain([])),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("Reservation Service", () => {
  beforeEach(() => vi.resetAllMocks()); // resetAllMocks clears queues AND implementations

  // ── createReservation ────────────────────────────────────────────────────
  describe("createReservation", () => {
    it("✓ creates a reservation when sufficient stock is available", async () => {
      mockSelect.mockImplementationOnce(() => makeChain([])); // no idempotency record

      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(makeTx({ executeRows: [[makeInvRow(5, 0)]] }))
      );
      setupFetchDetail("PENDING");

      const { createReservation } = await import("@/services/reservation.service");
      const result = await createReservation({ productId: "prod_1", warehouseId: "wh_1", quantity: 1 });

      expect(result.status).toBe("PENDING");
      expect(result.quantity).toBe(1);
      expect(mockTransaction).toHaveBeenCalledOnce();
    });

    it("✓ throws InsufficientStockError when stock is fully reserved (available = 0)", async () => {
      mockSelect.mockImplementationOnce(() => makeChain([]));
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(makeTx({ executeRows: [[makeInvRow(1, 1)]] })) // available = 0
      );

      const { createReservation } = await import("@/services/reservation.service");
      await expect(createReservation({ productId: "p", warehouseId: "w", quantity: 1 })).rejects.toThrow(InsufficientStockError);
    });

    it("✓ throws InsufficientStockError when requested qty exceeds available", async () => {
      mockSelect.mockImplementationOnce(() => makeChain([]));
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(makeTx({ executeRows: [[makeInvRow(3, 2)]] })) // available = 1
      );

      const { createReservation } = await import("@/services/reservation.service");
      await expect(createReservation({ productId: "p", warehouseId: "w", quantity: 5 })).rejects.toThrow(InsufficientStockError);
    });

    it("✓ concurrent race: exactly one succeeds when inventory = 1", async () => {
      // Simulate Postgres FOR UPDATE serialisation:
      //   First transaction  → reserved=0 → available=1 → succeeds
      //   Second transaction → reserved=1 → available=0 → InsufficientStockError (→ HTTP 409)
      let txCall = 0;
      mockSelect
        .mockImplementationOnce(() => makeChain([]))  // idempotency check A (no key set)
        .mockImplementationOnce(() => makeChain([])); // idempotency check B

      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const isFirst = ++txCall === 1;
        return fn(makeTx({ executeRows: [[makeInvRow(1, isFirst ? 0 : 1)]] }));
      });

      setupFetchDetail("PENDING"); // only the successful call reaches here

      const { createReservation } = await import("@/services/reservation.service");
      const params = { productId: "p", warehouseId: "w", quantity: 1 };

      const [a, b] = await Promise.allSettled([createReservation(params), createReservation(params)]);

      const wins  = [a, b].filter((r) => r.status === "fulfilled");
      const fails = [a, b].filter((r) => r.status === "rejected" && r.reason instanceof InsufficientStockError);

      expect(wins).toHaveLength(1);   // exactly one wins the lock
      expect(fails).toHaveLength(1);  // exactly one returns HTTP 409
    });

    it("✓ returns cached reservation on duplicate Idempotency-Key (no new transaction)", async () => {
      // Idempotency record exists in DB
      mockSelect.mockImplementationOnce(() => makeChain([{
        key: "idem-abc",
        response: { reservationId: "rsv_cached" },
        statusCode: 201,
        expiresAt: new Date(Date.now() + 86_400_000),
      }]));
      setupFetchDetail("PENDING");

      const { createReservation } = await import("@/services/reservation.service");
      const result = await createReservation({
        productId: "p", warehouseId: "w", quantity: 1, idempotencyKey: "idem-abc",
      });

      expect(mockTransaction).not.toHaveBeenCalled(); // no inventory mutation
      expect(result.status).toBe("PENDING");
    });
  });

  // ── confirmReservation ───────────────────────────────────────────────────
  describe("confirmReservation", () => {
    it("✓ confirms a valid PENDING reservation", async () => {
      mockSelect.mockImplementationOnce(() => makeChain([])); // no idempotency
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(makeTx({ selectRows: [[makeReservation("PENDING")]] }))
      );
      setupFetchDetail("CONFIRMED");

      const { confirmReservation } = await import("@/services/reservation.service");
      const result = await confirmReservation({ reservationId: "rsv_1" });
      expect(result.status).toBe("CONFIRMED");
    });

    it("✓ throws ReservationExpiredError when expiresAt is in the past", async () => {
      mockSelect.mockImplementationOnce(() => makeChain([]));
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(makeTx({ selectRows: [[makeReservation("PENDING", -1)]] })) // expired 1 min ago
      );

      const { confirmReservation } = await import("@/services/reservation.service");
      await expect(confirmReservation({ reservationId: "rsv_1" })).rejects.toThrow(ReservationExpiredError);
    });

    it("✓ throws ReservationExpiredError for status=EXPIRED records", async () => {
      mockSelect.mockImplementationOnce(() => makeChain([]));
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(makeTx({ selectRows: [[makeReservation("EXPIRED")]] }))
      );

      const { confirmReservation } = await import("@/services/reservation.service");
      await expect(confirmReservation({ reservationId: "rsv_1" })).rejects.toThrow(ReservationExpiredError);
    });

    it("✓ throws ReservationNotFoundError for unknown reservation IDs", async () => {
      mockSelect.mockImplementationOnce(() => makeChain([]));
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(makeTx({ selectRows: [[]] })) // empty = not found
      );

      const { confirmReservation } = await import("@/services/reservation.service");
      await expect(confirmReservation({ reservationId: "nope" })).rejects.toThrow(ReservationNotFoundError);
    });

    it("✓ is idempotent for already-CONFIRMED reservations", async () => {
      mockSelect.mockImplementationOnce(() => makeChain([]));
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(makeTx({ selectRows: [[makeReservation("CONFIRMED")]] }))
      );
      setupFetchDetail("CONFIRMED");

      const { confirmReservation } = await import("@/services/reservation.service");
      const result = await confirmReservation({ reservationId: "rsv_1" });
      expect(result.status).toBe("CONFIRMED");
    });
  });

  // ── releaseReservation ───────────────────────────────────────────────────
  describe("releaseReservation", () => {
    it("✓ releases a PENDING reservation and returns inventory to the pool", async () => {
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(makeTx({ selectRows: [[makeReservation("PENDING")]] }))
      );
      setupFetchDetail("RELEASED");

      const { releaseReservation } = await import("@/services/reservation.service");
      const result = await releaseReservation("rsv_1");
      expect(result.status).toBe("RELEASED");
    });

    it("✓ is idempotent — releasing an already-RELEASED reservation is safe", async () => {
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(makeTx({ selectRows: [[makeReservation("RELEASED")]] }))
      );
      setupFetchDetail("RELEASED");

      const { releaseReservation } = await import("@/services/reservation.service");
      const result = await releaseReservation("rsv_1");
      expect(result.status).toBe("RELEASED");
    });

    it("✓ throws ReservationNotFoundError for unknown IDs", async () => {
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(makeTx({ selectRows: [[]] }))
      );

      const { releaseReservation } = await import("@/services/reservation.service");
      await expect(releaseReservation("unknown")).rejects.toThrow(ReservationNotFoundError);
    });

    it("✓ throws ReservationInvalidStateError when releasing a CONFIRMED reservation", async () => {
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(makeTx({ selectRows: [[makeReservation("CONFIRMED")]] }))
      );

      const { releaseReservation } = await import("@/services/reservation.service");
      await expect(releaseReservation("rsv_1")).rejects.toThrow(ReservationInvalidStateError);
    });
  });

  // ── expireStaleReservations ──────────────────────────────────────────────
  describe("expireStaleReservations", () => {
    it("✓ expires all stale PENDING reservations and releases their inventory", async () => {
      const stale = [
        { id: "rsv_1", inventoryId: "inv_1", quantity: 2 },
        { id: "rsv_2", inventoryId: "inv_1", quantity: 1 },
      ];
      mockSelect.mockImplementation(() => makeChain(stale));
      mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ update: vi.fn(() => makeChain([])), execute: vi.fn().mockResolvedValue(pgResult([])), insert: vi.fn(() => makeChain([])) })
      );

      const { expireStaleReservations } = await import("@/services/reservation.service");
      const result = await expireStaleReservations();

      expect(result.expired).toBe(2);
      expect(result.ids).toEqual(["rsv_1", "rsv_2"]);
    });

    it("✓ returns { expired: 0 } and makes no DB writes when nothing is stale", async () => {
      mockSelect.mockImplementation(() => makeChain([]));

      const { expireStaleReservations } = await import("@/services/reservation.service");
      const result = await expireStaleReservations();

      expect(result.expired).toBe(0);
      expect(result.ids).toEqual([]);
      expect(mockTransaction).not.toHaveBeenCalled();
    });
  });
});
