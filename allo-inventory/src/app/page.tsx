// src/app/page.tsx
// Server component — data fetched server-side for fast TTFB, no N+1
import { db, products, inventories, warehouses } from "@/db/client";
import { eq } from "drizzle-orm";
import ProductCard from "@/components/ProductCard";
import { Package } from "lucide-react";
import type { ProductWithInventory } from "@/types";

export const dynamic = "force-dynamic";

async function getProducts(): Promise<ProductWithInventory[]> {
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
  return Array.from(productMap.values());
}

export default async function ProductsPage() {
  const productsList = await getProducts();

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-2">
          <Package size={20} style={{ color: "var(--accent-amber)" }} />
          <h1 style={{ fontSize: 28, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Product Catalogue
          </h1>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: 0 }}>
          Real-time inventory across all fulfilment centres.{" "}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
            {productsList.length} product{productsList.length !== 1 ? "s" : ""}
          </span>
        </p>
      </div>

      {productsList.length === 0 && (
        <div className="card" style={{ padding: "80px 40px", textAlign: "center" }}>
          <Package size={48} style={{ color: "var(--text-muted)", margin: "0 auto 16px" }} />
          <p style={{ color: "var(--text-secondary)", fontSize: 16 }}>
            No products found. Run the seed script to populate the database.
          </p>
          <code style={{
            display: "inline-block", marginTop: 12, padding: "6px 12px",
            background: "var(--bg-secondary)", border: "1px solid var(--border)",
            borderRadius: 4, fontFamily: "var(--font-mono)", fontSize: 13,
            color: "var(--accent-amber)",
          }}>
            npm run db:seed
          </code>
        </div>
      )}

      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))" }}>
        {productsList.map((product, i) => (
          <div key={product.id} className="fade-in" style={{ animationDelay: `${i * 0.05}s` }}>
            <ProductCard product={product} />
          </div>
        ))}
      </div>
    </div>
  );
}
