// src/components/ProductCard.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  MapPin,
  Package,
  AlertTriangle,
  ShoppingCart,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { ProductWithInventory, InventoryWithWarehouse } from "@/types";

interface Props {
  product: ProductWithInventory;
}

function StockIndicator({ available }: { available: number }) {
  if (available === 0)
    return (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--accent-red)",
          padding: "2px 8px",
          background: "rgba(239,68,68,0.1)",
          borderRadius: 4,
          border: "1px solid rgba(239,68,68,0.2)",
        }}
      >
        OUT OF STOCK
      </span>
    );

  if (available <= 3)
    return (
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          color: "var(--accent-amber)",
          padding: "2px 8px",
          background: "rgba(245,158,11,0.1)",
          borderRadius: 4,
          border: "1px solid rgba(245,158,11,0.2)",
        }}
      >
        {available} LEFT
      </span>
    );

  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        color: "var(--accent-green)",
        padding: "2px 8px",
        background: "rgba(16,185,129,0.1)",
        borderRadius: 4,
        border: "1px solid rgba(16,185,129,0.2)",
      }}
    >
      {available} AVAIL
    </span>
  );
}

function ReserveDialog({
  product,
  inventory,
  onClose,
}: {
  product: ProductWithInventory;
  inventory: InventoryWithWarehouse;
  onClose: () => void;
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleReserve() {
    if (!email) { toast.error("Please enter your email"); return; }
    setLoading(true);

    // Generate idempotency key for this reserve attempt
    const idempotencyKey = `reserve-${product.id}-${inventory.warehouseId}-${Date.now()}`;

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          productId: product.id,
          warehouseId: inventory.warehouseId,
          quantity,
          customerEmail: email,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          toast.error("Not enough stock available", {
            description: "Another customer just reserved the last unit. Try a different warehouse.",
          });
        } else {
          toast.error(json.error ?? "Reservation failed", { description: json.message });
        }
        return;
      }

      toast.success("Reserved! You have 10 minutes to complete your purchase.");
      onClose();
      router.push(`/reservations/${json.data.id}`);
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        className="card fade-in"
        style={{ width: "100%", maxWidth: 440, padding: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: "var(--text-primary)" }}>
          Reserve Units
        </h2>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20 }}>
          {product.name} · {inventory.warehouse.name}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)", display: "block", marginBottom: 6 }}>
              EMAIL ADDRESS
            </label>
            <input
              className="input-field"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)", display: "block", marginBottom: 6 }}>
              QUANTITY (max {inventory.available})
            </label>
            <input
              className="input-field"
              type="number"
              min={1}
              max={inventory.available}
              value={quantity}
              onChange={(e) => setQuantity(Math.min(inventory.available, Math.max(1, Number(e.target.value))))}
            />
          </div>

          <div
            style={{
              background: "rgba(245,158,11,0.06)",
              border: "1px solid rgba(245,158,11,0.15)",
              borderRadius: 6,
              padding: "10px 14px",
              fontSize: 12,
              color: "var(--text-secondary)",
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
            }}
          >
            <AlertTriangle size={14} style={{ color: "var(--accent-amber)", flexShrink: 0, marginTop: 1 }} />
            Reservation holds stock for 10 minutes. Confirm before it expires.
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
          <button className="btn-ghost" style={{ flex: 1 }} onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="btn-primary"
            style={{ flex: 2 }}
            onClick={handleReserve}
            disabled={loading || inventory.available < 1}
          >
            {loading ? "Reserving…" : `Reserve ${quantity} unit${quantity > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProductCard({ product }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [selectedInventory, setSelectedInventory] = useState<InventoryWithWarehouse | null>(null);

  const totalAvailable = product.inventories.reduce((sum, inv) => sum + inv.available, 0);
  const hasStock = totalAvailable > 0;

  return (
    <>
      <div
        className="card"
        style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16, height: "100%" }}
      >
        {/* Header */}
        <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 8,
              background: "var(--bg-secondary)",
              border: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Package size={22} style={{ color: "var(--text-muted)" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 2 }}>
              {product.name}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
              SKU: {product.sku}
            </div>
            {product.description && (
              <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                {product.description}
              </div>
            )}
          </div>
        </div>

        {/* Total stock bar */}
        <div
          style={{
            background: "var(--bg-secondary)",
            borderRadius: 6,
            padding: "8px 12px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>Total available</span>
          <StockIndicator available={totalAvailable} />
        </div>

        {/* Warehouses */}
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "var(--text-secondary)",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              marginBottom: expanded ? 10 : 0,
              fontFamily: "var(--font-mono)",
            }}
          >
            {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            {product.inventories.length} WAREHOUSE{product.inventories.length !== 1 ? "S" : ""}
          </button>

          {expanded && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {product.inventories.map((inv) => (
                <div
                  key={inv.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    background: "var(--bg-secondary)",
                    borderRadius: 6,
                    border: "1px solid var(--border-subtle)",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                      {inv.warehouse.name}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                      <MapPin size={10} />
                      {inv.warehouse.location}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <StockIndicator available={inv.available} />
                    {inv.available > 0 && (
                      <button
                        className="btn-primary"
                        style={{ padding: "4px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}
                        onClick={() => setSelectedInventory(inv)}
                      >
                        <ShoppingCart size={12} />
                        Reserve
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Primary reserve button */}
        {!expanded && (
          <button
            className={hasStock ? "btn-primary" : "btn-ghost"}
            style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            onClick={() => {
              if (!hasStock) return;
              const firstAvailable = product.inventories.find((inv) => inv.available > 0);
              if (firstAvailable) setSelectedInventory(firstAvailable);
              else setExpanded(true);
            }}
            disabled={!hasStock}
          >
            <ShoppingCart size={15} />
            {hasStock ? "Reserve" : "Out of Stock"}
          </button>
        )}
      </div>

      {selectedInventory && (
        <ReserveDialog
          product={product}
          inventory={selectedInventory}
          onClose={() => setSelectedInventory(null)}
        />
      )}
    </>
  );
}
