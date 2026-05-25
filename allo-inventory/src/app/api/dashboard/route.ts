// src/app/api/dashboard/route.ts
import { NextResponse } from "next/server";
import { db, products, warehouses, reservations, inventories, auditLogs } from "@/db/client";
import { eq, count, sum, sql } from "drizzle-orm";
import { withErrorHandling } from "@/lib/api";
import type { DashboardMetrics } from "@/types";

export const dynamic = "force-dynamic";

interface ActivityRow extends Record<string, unknown> {
  id: string;
  event: string;
  created_at: Date;
  reservation_id: string;
  product_name: string;
}

export async function GET() {
  return withErrorHandling(async () => {
    const [
      [totalProductsRow],
      [totalWarehousesRow],
      [activeRow],
      [confirmedRow],
      [expiredRow],
      [inventoryAgg],
      recentResult,
    ] = await Promise.all([
      db.select({ count: count() }).from(products),
      db.select({ count: count() }).from(warehouses),
      db.select({ count: count() }).from(reservations).where(eq(reservations.status, "PENDING")),
      db.select({ count: count() }).from(reservations).where(eq(reservations.status, "CONFIRMED")),
      db.select({ count: count() }).from(reservations).where(eq(reservations.status, "EXPIRED")),
      db.select({ totalQty: sum(inventories.quantity), totalReserved: sum(inventories.reserved) }).from(inventories),
      db.execute<ActivityRow>(sql`
        SELECT al.id, al.event,
               al."createdAt"    AS created_at,
               al."reservationId" AS reservation_id,
               p.name            AS product_name
        FROM   "AuditLog"    al
        JOIN   "Reservation" r  ON r.id  = al."reservationId"
        JOIN   "Inventory"   i  ON i.id  = r."inventoryId"
        JOIN   "Product"     p  ON p.id  = i."productId"
        ORDER  BY al."createdAt" DESC
        LIMIT  20
      `),
    ]);

    const metrics: DashboardMetrics = {
      totalProducts:        totalProductsRow?.count        ?? 0,
      totalWarehouses:      totalWarehousesRow?.count      ?? 0,
      activeReservations:   activeRow?.count               ?? 0,
      confirmedReservations: confirmedRow?.count           ?? 0,
      expiredReservations:  expiredRow?.count              ?? 0,
      totalInventoryUnits:  Number(inventoryAgg?.totalQty  ?? 0),
    };

    // pg driver returns QueryResult — rows live in .rows
    const recentActivity = recentResult.rows.map((l) => ({
      id: l.id,
      event: l.event,
      createdAt: new Date(l.created_at).toISOString(),
      reservationId: l.reservation_id,
      productName: l.product_name,
    }));

    return NextResponse.json({
      data: metrics,
      recentActivity,
      totalReservedUnits: Number(inventoryAgg?.totalReserved ?? 0),
    });
  });
}
