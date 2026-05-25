// src/app/api/warehouses/route.ts
import { NextResponse } from "next/server";
import { db, warehouses } from "@/db/client";
import { withErrorHandling } from "@/lib/api";
import type { WarehouseDto } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return withErrorHandling(async () => {
    const rows = await db.select().from(warehouses).orderBy(warehouses.name);

    const response: WarehouseDto[] = rows.map((w) => ({
      id: w.id,
      name: w.name,
      location: w.location,
      createdAt: w.createdAt.toISOString(),
    }));

    return NextResponse.json({ data: response });
  });
}
