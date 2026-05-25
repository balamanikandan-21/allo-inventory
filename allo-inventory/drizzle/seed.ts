// drizzle/seed.ts
// Seeds the database with realistic Allo Health product data.
// Run: npm run db:seed

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../src/db/schema";
import { nanoid } from "../src/lib/nanoid";

const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
const db = drizzle(pool, { schema });

async function main() {
  console.log("🌱 Seeding database…");

  // Clean slate (order matters for FK constraints)
  await db.delete(schema.auditLogs);
  await db.delete(schema.idempotencyRecords);
  await db.delete(schema.reservations);
  await db.delete(schema.inventories);
  await db.delete(schema.products);
  await db.delete(schema.warehouses);

  // ── Warehouses ──────────────────────────────────────────────────────────
  const warehouseData = [
    { id: nanoid(), name: "Mumbai Fulfilment Centre", location: "Mumbai, MH" },
    { id: nanoid(), name: "Delhi NCR Hub", location: "Gurugram, HR" },
    { id: nanoid(), name: "Bangalore South Depot", location: "Bengaluru, KA" },
  ];
  await db.insert(schema.warehouses).values(warehouseData);
  const [mumbai, delhi, bangalore] = warehouseData as [typeof warehouseData[0], typeof warehouseData[0], typeof warehouseData[0]];

  console.log("✅ Warehouses created");

  // ── Products ─────────────────────────────────────────────────────────────
  const productData = [
    { id: nanoid(), name: "Allo Smart Scale Pro", description: "Bioelectrical impedance analysis scale with app sync. Measures 13 body metrics including BMI, muscle mass, and visceral fat.", sku: "ALLO-SCALE-PRO-001", imageUrl: null },
    { id: nanoid(), name: "Allo Blood Glucose Monitor", description: "CGM-compatible glucometer with 14-day trend tracking and AI-powered dietary insights.", sku: "ALLO-BGM-STD-002", imageUrl: null },
    { id: nanoid(), name: "Allo Health Coaching Kit", description: "3-month coaching bundle: BP monitor, sleep tracker, and 12 expert consultations.", sku: "ALLO-KIT-COACH-003", imageUrl: null },
    { id: nanoid(), name: "Allo BP Monitor Advanced", description: "Clinically validated upper-arm BP monitor with afib detection and irregular heartbeat alerts.", sku: "ALLO-BP-ADV-004", imageUrl: null },
    { id: nanoid(), name: "Allo Sleep Tracker Band", description: "7-day battery, SpO2 and HRV tracking, silent alarm vibration. Waterproof to 50m.", sku: "ALLO-SLEEP-BAND-005", imageUrl: null },
  ];
  await db.insert(schema.products).values(productData);
  const [scale, bgm, kit, bp, sleep] = productData as typeof productData;

  console.log("✅ Products created");

  // ── Inventory ─────────────────────────────────────────────────────────────
  // Intentionally low-stock items for demoing race conditions:
  //   Bangalore → Scale Pro:        1 unit  (perfect for race demo)
  //   Mumbai    → Coaching Kit:     2 units (also good for concurrent test)
  const inventoryData = [
    { id: nanoid(), productId: scale!.id, warehouseId: mumbai!.id, quantity: 50, reserved: 0 },
    { id: nanoid(), productId: scale!.id, warehouseId: delhi!.id, quantity: 30, reserved: 0 },
    { id: nanoid(), productId: scale!.id, warehouseId: bangalore!.id, quantity: 1, reserved: 0 },  // ← SCARCE
    { id: nanoid(), productId: bgm!.id, warehouseId: mumbai!.id, quantity: 120, reserved: 0 },
    { id: nanoid(), productId: bgm!.id, warehouseId: delhi!.id, quantity: 80, reserved: 0 },
    { id: nanoid(), productId: kit!.id, warehouseId: mumbai!.id, quantity: 2, reserved: 0 },       // ← SCARCE
    { id: nanoid(), productId: kit!.id, warehouseId: bangalore!.id, quantity: 15, reserved: 0 },
    { id: nanoid(), productId: bp!.id, warehouseId: delhi!.id, quantity: 60, reserved: 0 },
    { id: nanoid(), productId: bp!.id, warehouseId: bangalore!.id, quantity: 40, reserved: 0 },
    { id: nanoid(), productId: sleep!.id, warehouseId: mumbai!.id, quantity: 200, reserved: 0 },
    { id: nanoid(), productId: sleep!.id, warehouseId: delhi!.id, quantity: 150, reserved: 0 },
    { id: nanoid(), productId: sleep!.id, warehouseId: bangalore!.id, quantity: 0, reserved: 0 }, // ← OUT OF STOCK
  ];
  await db.insert(schema.inventories).values(inventoryData);

  console.log("✅ Inventory created");
  console.log("\n🎉 Seed complete!\n");
  console.log("  Scarce stock for race demos:");
  console.log("  → Allo Smart Scale Pro @ Bangalore South Depot:   1 unit");
  console.log("  → Allo Health Coaching Kit @ Mumbai FC:            2 units\n");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => pool.end());
