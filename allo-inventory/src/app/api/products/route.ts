// src/app/api/products/route.ts
import { NextResponse } from "next/server";
import { db, products, inventories, warehouses } from "@/db/client";
import { eq } from "drizzle-orm";
import { withErrorHandling } from "@/lib/api";
import type { ProductWithInventory } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return withErrorHandling(async () => {
    // Single query with joins to avoid N+1
    const rows = await db
      .select({
        productId: products.id,
        productName: products.name,
        productDescription: products.description,
        productSku: products.sku,
        productImageUrl: products.imageUrl,
        inventoryId: inventories.id,
        inventoryQuantity: inventories.quantity,
        inventoryReserved: inventories.reserved,
        warehouseId: warehouses.id,
        warehouseName: warehouses.name,
        warehouseLocation: warehouses.location,
      })
      .from(products)
      .leftJoin(inventories, eq(inventories.productId, products.id))
      .leftJoin(warehouses, eq(warehouses.id, inventories.warehouseId))
      .orderBy(products.name, warehouses.name);

    // Group by product
    const productMap = new Map<string, ProductWithInventory>();
    for (const row of rows) {
      if (!productMap.has(row.productId)) {
        productMap.set(row.productId, {
          id: row.productId,
          name: row.productName,
          description: row.productDescription,
          sku: row.productSku,
          imageUrl: row.productImageUrl,
          inventories: [],
        });
      }
      if (row.inventoryId && row.warehouseId) {
        productMap.get(row.productId)!.inventories.push({
          id: row.inventoryId,
          warehouseId: row.warehouseId,
          warehouse: {
            id: row.warehouseId,
            name: row.warehouseName!,
            location: row.warehouseLocation!,
          },
          quantity: row.inventoryQuantity ?? 0,
          reserved: row.inventoryReserved ?? 0,
          available: Math.max(0, (row.inventoryQuantity ?? 0) - (row.inventoryReserved ?? 0)),
        });
      }
    }

    return NextResponse.json({ data: Array.from(productMap.values()) });
  });
}
