# Implementation Summary

## Overview

Full-stack inventory reservation system built with **Next.js 15 App Router**, **TypeScript strict mode**, **PostgreSQL**, **Drizzle ORM**, **TailwindCSS**, and **Zod**. Solves the checkout race condition where multiple customers compete for the last unit of a SKU during a multi-step payment flow.

---

## Architecture

```
src/
├── app/
│   ├── page.tsx                          # Product listing (SSR)
│   ├── dashboard/page.tsx                # Metrics dashboard (SSR)
│   ├── warehouses/page.tsx               # Warehouse inventory table (SSR)
│   ├── reservations/[id]/page.tsx        # Checkout + countdown (CSR)
│   └── api/
│       ├── products/route.ts             # GET /api/products
│       ├── warehouses/route.ts           # GET /api/warehouses
│       ├── dashboard/route.ts            # GET /api/dashboard
│       ├── reservations/
│       │   ├── route.ts                  # POST /api/reservations
│       │   └── [id]/
│       │       ├── route.ts              # GET /api/reservations/:id
│       │       ├── confirm/route.ts      # POST .../confirm
│       │       └── release/route.ts      # POST .../release
│       └── cron/expire-reservations/     # Vercel Cron sweep
├── db/
│   ├── schema.ts                         # Drizzle schema (all tables + indexes)
│   └── client.ts                         # pg Pool singleton + drizzle instance
├── services/
│   └── reservation.service.ts            # All business logic + locking
├── lib/
│   ├── errors.ts                         # Typed AppError hierarchy
│   ├── api.ts                            # withErrorHandling() + getIdempotencyKey()
│   └── nanoid.ts                         # Crypto-random ID generator
└── types/index.ts                        # Shared DTO types
```

---

## Concurrency Handling

The core of the system. In `reservation.service.ts → createReservation()`:

```typescript
// 1. Open Serializable transaction
db.transaction(async (tx) => {

  // 2. Acquire exclusive row lock — concurrent transactions BLOCK here
  const rows = await tx.execute(sql`
    SELECT id, quantity, reserved
    FROM "Inventory"
    WHERE "productId" = ${productId} AND "warehouseId" = ${warehouseId}
    FOR UPDATE
  `);

  // 3. Check availability INSIDE the lock (guaranteed fresh — no stale reads)
  const available = rows[0].quantity - rows[0].reserved;
  if (available < quantity) throw new InsufficientStockError(available, quantity);

  // 4. Atomically increment reserved counter
  await tx.update(inventories).set({ reserved: sql`reserved + ${quantity}` });

  // 5. Insert reservation + audit log + idempotency record (all one commit)
  await tx.insert(reservations).values({ ... });
});
```

**Why this works:** `FOR UPDATE` means the second concurrent transaction blocks at step 2 until the first commits. When it unblocks it re-reads `reserved` from disk — not a pre-lock snapshot. If stock is now gone it throws `InsufficientStockError` → HTTP 409.

**Tested by:** the "concurrent race" test fires two `createReservation` calls simultaneously via `Promise.allSettled` and asserts exactly one fulfills and one rejects with `InsufficientStockError`.

---

## Database Design

### Key decision: dual-counter model

| Column | Meaning |
|---|---|
| `Inventory.quantity` | Total physical units on shelf |
| `Inventory.reserved` | Units held by PENDING reservations |

`available = quantity − reserved` — never stored, always derived. This avoids expensive `COUNT`/`SUM` aggregates on the reservation table for every product listing query.

**On confirm:** `quantity--` and `reserved--` (stock permanently sold).  
**On release/expire:** `reserved--` only (stock returned to pool).

### Critical indexes

- `Reservation(status, expiresAt)` — makes the cron sweep O(expired), not O(all)
- `Inventory(productId, warehouseId) UNIQUE` — lock target + uniqueness guard
- `Reservation(idempotencyKey) UNIQUE` — prevents duplicate rows under race

---

## API Design

Consistent error envelope:
```json
{ "error": "INSUFFICIENT_STOCK", "message": "Requested 2 units but only 1 available" }
```

Zod validation on all write endpoints. `withErrorHandling()` in `src/lib/api.ts` catches `AppError` subclasses and maps them to the correct HTTP status automatically.

Typed response shapes ensure the API contract is enforced at compile time — no `any` anywhere.

---

## Idempotency

Client sends `Idempotency-Key: <uuid>` header. Service:
1. Checks `IdempotencyRecord` table before any mutation.
2. On cache hit: returns original response, zero inventory impact.
3. On cache miss: writes `IdempotencyRecord` **inside the same transaction** as the reservation — atomic, no split-brain possible.

Result: safe retries, no duplicate reservations, correct under network failures.

---

## Expiry

**Cron path:** Vercel Cron (`* * * * *`) calls `GET /api/cron/expire-reservations`. The handler finds all `PENDING` reservations past `expiresAt` and:
- Updates their status to `EXPIRED` in a batch
- Releases inventory holds in a single bulk SQL `UPDATE` per affected inventory row
- Writes audit log entries

**Lazy path:** `GET /api/reservations/:id` (the checkout page polling) checks wall-clock expiry inline and expires the reservation before responding. Closes the up-to-60-second gap between cron runs.

---

## Frontend

| Page | Rendering | Notes |
|---|---|---|
| `/` | SSR (server component) | Single JOIN query, no N+1 |
| `/warehouses` | SSR | Inventory table with utilisation % |
| `/dashboard` | SSR + API fetch | Metrics + activity timeline |
| `/reservations/[id]` | CSR | Live countdown timer, polling, toast notifications |

The reservation checkout page uses a `useCountdown` hook that ticks every second and shows urgent styling (pulsing red) when under 60 seconds remain. It polls the API every 30 seconds to pick up server-side status changes.

---

## Testing Approach

16 unit tests with a fully mocked Drizzle client — no live database needed. Each test uses `vi.resetAllMocks()` in `beforeEach` (which clears both call history and return-value queues) and `mockImplementationOnce` for precise per-call control.

The **concurrent race test** is the most important: it fires two `createReservation` calls simultaneously, simulates the `FOR UPDATE` lock serialization via mock return values, and asserts `exactly 1 success + exactly 1 InsufficientStockError`.

---

## Interview Talking Points

1. **"How does your system prevent overselling?"**
   — `SELECT FOR UPDATE` inside a Serializable transaction. The lock is acquired before the availability check, held through the `UPDATE`, and released only on commit. The second concurrent transaction reads the committed value — not a snapshot — so it sees the correct (post-increment) reserved count.

2. **"What happens if the payment provider never responds?"**
   — The reservation expires automatically after 10 minutes via Vercel Cron + lazy expiry on reads. The `reserved` counter is decremented and the units return to the available pool. No manual intervention.

3. **"How would you scale this to 100k concurrent users?"**
   — The row-level lock is held for microseconds (just the transaction). True contention only occurs when multiple users simultaneously race for the last unit of a specific SKU+warehouse — a rare event. For broader scale: add Postgres read replicas for the product listing queries, use Redis for idempotency (sub-ms vs. ~5ms for Postgres), and consider partitioning `AuditLog` by month. The API routes are stateless and scale horizontally on Vercel without code changes.

4. **"Why Drizzle instead of Prisma?"**
   — Drizzle is pure TypeScript with zero native binary dependencies. It ships as plain JS — no platform-specific query engine download needed at `npm install` time. This makes it trivially deployable in CI, air-gapped environments, and edge runtimes. The SQL escape hatch (`db.execute(sql\`...\`)`) handles the `FOR UPDATE` clause that no ORM query builder exposes.

5. **"How does idempotency work under a concurrent retry storm?"**
   — The `IdempotencyRecord.key` column has a `UNIQUE` index. If two identical requests race before either has written the record, only one `INSERT` will succeed — the other gets a unique constraint violation, which surfaces as a retryable error. Writing the record inside the same transaction as the reservation ensures they're atomic: no record exists without the reservation, and no reservation exists without the record.

---

## What I'd Add with More Time

- **Redis for distributed locking** — for multi-region Postgres, advisory locks scoped to one primary aren't sufficient; Redlock would be needed
- **Payment webhook** — replace the manual "Confirm" button with a Stripe/Razorpay webhook listener
- **Supabase Realtime** — push inventory changes to all connected clients so the product list stays live without polling
- **Rate limiting** — per-IP throttle on `POST /api/reservations` to block bot-driven stock depletion
- **E2E tests** — Playwright tests covering the full reserve → confirm and reserve → expire flows against a real test database
