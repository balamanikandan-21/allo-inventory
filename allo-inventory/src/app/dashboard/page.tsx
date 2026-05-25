// src/app/dashboard/page.tsx
import { BarChart3, Package, Warehouse, Clock, CheckCircle2, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

async function getMetrics() {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"}/api/dashboard`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error("Failed to fetch dashboard metrics");
  return res.json() as Promise<{
    data: {
      totalProducts: number; totalWarehouses: number; activeReservations: number;
      confirmedReservations: number; expiredReservations: number; totalInventoryUnits: number;
    };
    recentActivity: Array<{ id: string; event: string; createdAt: string; reservationId: string; productName: string }>;
    totalReservedUnits: number;
  }>;
}

export default async function DashboardPage() {
  const { data: metrics, recentActivity, totalReservedUnits } = await getMetrics();

  const statCards = [
    { label: "Products", value: metrics.totalProducts, icon: Package, color: "var(--accent-amber)", bg: "rgba(245,158,11,0.08)" },
    { label: "Warehouses", value: metrics.totalWarehouses, icon: Warehouse, color: "var(--accent-blue)", bg: "rgba(59,130,246,0.08)" },
    { label: "Active Holds", value: metrics.activeReservations, icon: Clock, color: "var(--accent-amber)", bg: "rgba(245,158,11,0.08)" },
    { label: "Confirmed", value: metrics.confirmedReservations, icon: CheckCircle2, color: "var(--accent-green)", bg: "rgba(16,185,129,0.08)" },
    { label: "Expired", value: metrics.expiredReservations, icon: AlertTriangle, color: "var(--accent-red)", bg: "rgba(239,68,68,0.08)" },
    { label: "Total Units", value: metrics.totalInventoryUnits, icon: BarChart3, color: "#a78bfa", bg: "rgba(167,139,250,0.08)" },
  ];

  const eventConfig: Record<string, { color: string; label: string }> = {
    CREATED: { color: "var(--accent-blue)", label: "Reserved" },
    CONFIRMED: { color: "var(--accent-green)", label: "Confirmed" },
    RELEASED: { color: "var(--text-secondary)", label: "Released" },
    EXPIRED: { color: "var(--accent-red)", label: "Expired" },
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div className="mb-10">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <BarChart3 size={20} style={{ color: "var(--accent-amber)" }} />
          <h1 style={{ fontSize: 28, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>Dashboard</h1>
        </div>
        <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: 0 }}>System-wide inventory and reservation metrics</p>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card" style={{ padding: "20px 22px" }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <Icon size={17} style={{ color }} />
            </div>
            <div className="tabular-nums" style={{ fontSize: 32, fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-mono)", lineHeight: 1, marginBottom: 4 }}>
              {value.toLocaleString()}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Utilisation bar */}
      <div className="card" style={{ padding: 24, marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 16, fontFamily: "var(--font-mono)" }}>INVENTORY UTILISATION</h2>
        <div style={{ display: "flex", gap: 32, marginBottom: 16 }}>
          {[
            { label: "Total Units", value: metrics.totalInventoryUnits, color: "var(--text-primary)" },
            { label: "Reserved", value: totalReservedUnits, color: "var(--accent-amber)" },
            { label: "Available", value: Math.max(0, metrics.totalInventoryUnits - totalReservedUnits), color: "var(--accent-green)" },
          ].map(({ label, value, color }) => (
            <div key={label}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 22, fontWeight: 600, fontFamily: "var(--font-mono)", color }}>{value}</div>
            </div>
          ))}
        </div>
        {metrics.totalInventoryUnits > 0 && (
          <>
            <div style={{ height: 8, background: "var(--bg-secondary)", borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                height: "100%",
                width: `${Math.min(100, (totalReservedUnits / metrics.totalInventoryUnits) * 100)}%`,
                background: "var(--accent-amber)", borderRadius: 4,
              }} />
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6, fontFamily: "var(--font-mono)" }}>
              {((totalReservedUnits / metrics.totalInventoryUnits) * 100).toFixed(1)}% RESERVED
            </div>
          </>
        )}
      </div>

      {/* Recent activity */}
      <div className="card" style={{ padding: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 18, fontFamily: "var(--font-mono)" }}>RECENT ACTIVITY</h2>
        {recentActivity.length === 0
          ? <p style={{ color: "var(--text-muted)", fontSize: 13 }}>No activity yet.</p>
          : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {recentActivity.map((log) => {
                const cfg = eventConfig[log.event] ?? eventConfig["CREATED"]!;
                return (
                  <div key={log.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0", borderBottom: "1px solid var(--border-subtle)" }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: "var(--text-primary)" }}>
                        <span style={{ fontWeight: 500 }}>{cfg.label}</span>
                        {" — "}
                        <span style={{ color: "var(--text-secondary)" }}>{log.productName}</span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{log.reservationId}</div>
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", flexShrink: 0 }}>
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}
