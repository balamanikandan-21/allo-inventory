// src/app/warehouses/page.tsx
import { db, warehouses, inventories, products } from "@/db/client";
import { eq } from "drizzle-orm";
import { Warehouse, MapPin, Package } from "lucide-react";

export const dynamic = "force-dynamic";

async function getWarehouses() {
  const rows = await db
    .select({
      warehouseId: warehouses.id,
      warehouseName: warehouses.name,
      warehouseLocation: warehouses.location,
      inventoryId: inventories.id,
      inventoryQuantity: inventories.quantity,
      inventoryReserved: inventories.reserved,
      productId: products.id,
      productName: products.name,
      productSku: products.sku,
    })
    .from(warehouses)
    .leftJoin(inventories, eq(inventories.warehouseId, warehouses.id))
    .leftJoin(products, eq(products.id, inventories.productId))
    .orderBy(warehouses.name, products.name);

  // Group by warehouse
  const warehouseMap = new Map<string, {
    id: string; name: string; location: string;
    inventories: Array<{
      id: string; quantity: number; reserved: number;
      product: { id: string; name: string; sku: string };
    }>;
  }>();

  for (const row of rows) {
    if (!warehouseMap.has(row.warehouseId)) {
      warehouseMap.set(row.warehouseId, {
        id: row.warehouseId, name: row.warehouseName, location: row.warehouseLocation,
        inventories: [],
      });
    }
    if (row.inventoryId && row.productId) {
      warehouseMap.get(row.warehouseId)!.inventories.push({
        id: row.inventoryId,
        quantity: row.inventoryQuantity ?? 0,
        reserved: row.inventoryReserved ?? 0,
        product: { id: row.productId, name: row.productName!, sku: row.productSku! },
      });
    }
  }
  return Array.from(warehouseMap.values());
}

export default async function WarehousesPage() {
  const warehouseList = await getWarehouses();

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="mb-10">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <Warehouse size={20} style={{ color: "var(--accent-amber)" }} />
          <h1 style={{ fontSize: 28, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
            Warehouses
          </h1>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: 0 }}>
          {warehouseList.length} fulfilment {warehouseList.length === 1 ? "centre" : "centres"}
        </p>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {warehouseList.map((wh) => {
          const totalUnits = wh.inventories.reduce((s, i) => s + i.quantity, 0);
          const totalReserved = wh.inventories.reduce((s, i) => s + i.reserved, 0);
          return (
            <div key={wh.id} className="card" style={{ padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
                <div>
                  <h2 style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
                    {wh.name}
                  </h2>
                  <div style={{ fontSize: 13, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: 5 }}>
                    <MapPin size={13} />{wh.location}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>UTILISATION</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 600, color: "var(--accent-amber)" }}>
                    {totalUnits > 0 ? `${Math.round((totalReserved / totalUnits) * 100)}%` : "—"}
                  </div>
                </div>
              </div>

              <div style={{ background: "var(--bg-secondary)", borderRadius: 6, border: "1px solid var(--border)", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Product", "SKU", "Total", "Reserved", "Available"].map((col) => (
                        <th key={col} style={{ padding: "8px 16px", textAlign: "left", fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontWeight: 500 }}>
                          {col.toUpperCase()}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {wh.inventories.map((inv) => {
                      const available = Math.max(0, inv.quantity - inv.reserved);
                      return (
                        <tr key={inv.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td style={{ padding: "10px 16px", fontSize: 13, color: "var(--text-primary)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <Package size={13} style={{ color: "var(--text-muted)" }} />
                              {inv.product.name}
                            </div>
                          </td>
                          <td style={{ padding: "10px 16px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{inv.product.sku}</td>
                          <td style={{ padding: "10px 16px", fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-secondary)" }}>{inv.quantity}</td>
                          <td style={{ padding: "10px 16px", fontFamily: "var(--font-mono)", fontSize: 13, color: inv.reserved > 0 ? "var(--accent-amber)" : "var(--text-muted)" }}>{inv.reserved}</td>
                          <td style={{ padding: "10px 16px" }}>
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600,
                              color: available === 0 ? "var(--accent-red)" : available <= 3 ? "var(--accent-amber)" : "var(--accent-green)" }}>
                              {available}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {wh.inventories.length === 0 && (
                      <tr><td colSpan={5} style={{ padding: "16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>No inventory</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
