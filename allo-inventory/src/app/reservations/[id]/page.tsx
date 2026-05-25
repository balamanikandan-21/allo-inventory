// src/app/reservations/[id]/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Clock, CheckCircle2, XCircle, AlertTriangle, MapPin, Hash, Activity } from "lucide-react";
import type { ReservationWithDetails } from "@/types";
import { format, formatDistanceToNow } from "date-fns";

// ── Countdown hook ──────────────────────────────────────────────────────────

function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!expiresAt) return;
    const expiry = new Date(expiresAt).getTime();
    const tick = () => setRemaining(Math.max(0, expiry - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return {
    minutes: Math.floor(remaining / 60000),
    seconds: Math.floor((remaining % 60000) / 1000),
    isUrgent: remaining < 60000 && remaining > 0,
    isExpired: remaining === 0,
  };
}

// ── Status badge ────────────────────────────────────────────────────────────

const STATUS_MAP = {
  PENDING:   { label: "PENDING",   cls: "badge-pending",   icon: <Clock size={12} /> },
  CONFIRMED: { label: "CONFIRMED", cls: "badge-confirmed", icon: <CheckCircle2 size={12} /> },
  RELEASED:  { label: "RELEASED",  cls: "badge-released",  icon: <XCircle size={12} /> },
  EXPIRED:   { label: "EXPIRED",   cls: "badge-expired",   icon: <AlertTriangle size={12} /> },
} as const;

function StatusBadge({ status }: { status: string }) {
  const entry = STATUS_MAP[status as keyof typeof STATUS_MAP] ?? STATUS_MAP.PENDING;
  return (
    <span
      className={entry.cls}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 10px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        fontFamily: "var(--font-mono)",
      }}
    >
      {entry.icon}
      {entry.label}
    </span>
  );
}

// ── Audit timeline ──────────────────────────────────────────────────────────

const EVENT_CONFIG = {
  CREATED:   { color: "var(--accent-blue)",  icon: <Hash size={13} /> },
  CONFIRMED: { color: "var(--accent-green)", icon: <CheckCircle2 size={13} /> },
  RELEASED:  { color: "var(--text-secondary)", icon: <XCircle size={13} /> },
  EXPIRED:   { color: "var(--accent-red)",   icon: <AlertTriangle size={13} /> },
} as const;

function AuditTimeline({ logs }: { logs: ReservationWithDetails["auditLogs"] }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 14, color: "var(--text-secondary)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
        <Activity size={13} />
        ACTIVITY TIMELINE
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {logs.map((log, i) => {
          const cfg = EVENT_CONFIG[log.event as keyof typeof EVENT_CONFIG] ?? EVENT_CONFIG.CREATED;
          return (
            <div key={log.id} style={{ display: "flex", gap: 12, position: "relative" }}>
              {i < logs.length - 1 && (
                <div style={{ position: "absolute", left: 12, top: 28, bottom: 0, width: 1, background: "var(--border)" }} />
              )}
              <div
                style={{
                  width: 25, height: 25, borderRadius: "50%",
                  background: `${cfg.color}18`, border: `1px solid ${cfg.color}40`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: cfg.color, flexShrink: 0, marginTop: 2, zIndex: 1,
                }}
              >
                {cfg.icon}
              </div>
              <div style={{ paddingBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
                  {log.event.charAt(0) + log.event.slice(1).toLowerCase()}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                  {format(new Date(log.createdAt), "MMM d, HH:mm:ss")}
                </div>
              </div>
            </div>
          );
        })}
        {logs.length === 0 && <p style={{ fontSize: 13, color: "var(--text-muted)" }}>No activity yet.</p>}
      </div>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────

export default function ReservationPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [reservation, setReservation] = useState<ReservationWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<"confirm" | "cancel" | null>(null);

  const { minutes, seconds, isUrgent, isExpired } = useCountdown(
    reservation?.status === "PENDING" ? reservation.expiresAt : null
  );

  const fetchReservation = useCallback(async () => {
    try {
      const res = await fetch(`/api/reservations/${params.id}`, { cache: "no-store" });
      const json = await res.json() as { data?: ReservationWithDetails; error?: string };
      if (res.ok && json.data) setReservation(json.data);
      else toast.error(json.error ?? "Failed to load reservation");
    } catch {
      toast.error("Network error");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { fetchReservation(); }, [fetchReservation]);

  // Poll every 30 s while PENDING
  useEffect(() => {
    if (reservation?.status !== "PENDING") return;
    const id = setInterval(fetchReservation, 30_000);
    return () => clearInterval(id);
  }, [reservation?.status, fetchReservation]);

  // Auto-refresh when countdown hits 0
  useEffect(() => {
    if (isExpired && reservation?.status === "PENDING") fetchReservation();
  }, [isExpired, reservation?.status, fetchReservation]);

  async function handleConfirm() {
    setActionLoading("confirm");
    try {
      const res = await fetch(`/api/reservations/${params.id}/confirm`, {
        method: "POST",
        headers: { "Idempotency-Key": `confirm-${params.id}-${Date.now()}` },
      });
      const json = await res.json() as { data?: ReservationWithDetails; error?: string; message?: string };
      if (res.ok && json.data) {
        setReservation(json.data);
        toast.success("Purchase confirmed! Your order has been placed.");
      } else if (res.status === 410) {
        toast.error("Reservation expired", { description: "Your hold timed out. Please reserve again." });
        fetchReservation();
      } else {
        toast.error(json.error ?? "Confirmation failed", { description: json.message });
      }
    } catch { toast.error("Network error"); }
    finally { setActionLoading(null); }
  }

  async function handleCancel() {
    setActionLoading("cancel");
    try {
      const res = await fetch(`/api/reservations/${params.id}/release`, { method: "POST" });
      const json = await res.json() as { data?: ReservationWithDetails; error?: string; message?: string };
      if (res.ok && json.data) {
        setReservation(json.data);
        toast.success("Reservation cancelled. Stock has been returned.");
        setTimeout(() => router.push("/"), 2000);
      } else {
        toast.error(json.error ?? "Cancellation failed", { description: json.message });
      }
    } catch { toast.error("Network error"); }
    finally { setActionLoading(null); }
  }

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 400 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: "2px solid var(--border)", borderTopColor: "var(--accent-amber)", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading reservation…</p>
        </div>
      </div>
    );
  }

  if (!reservation) {
    return (
      <div style={{ maxWidth: 600, margin: "80px auto", padding: "0 24px", textAlign: "center" }}>
        <AlertTriangle size={40} style={{ color: "var(--accent-red)", margin: "0 auto 16px" }} />
        <h1 style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)" }}>Reservation not found</h1>
        <button className="btn-primary" style={{ marginTop: 20 }} onClick={() => router.push("/")}>
          Browse Products
        </button>
      </div>
    );
  }

  const isPending = reservation.status === "PENDING";
  const isConfirmed = reservation.status === "CONFIRMED";

  return (
    <div className="max-w-7xl mx-auto px-6 py-10">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 24, alignItems: "start" }}>
        {/* ── Left panel ─────────────────────────────────────────────────── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card" style={{ padding: 24 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginBottom: 6 }}>RESERVATION</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Hash size={14} style={{ color: "var(--text-muted)" }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--text-secondary)" }}>{reservation.id}</span>
                </div>
              </div>
              <StatusBadge status={reservation.status} />
            </div>

            {/* Details grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: "16px 0", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)", marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginBottom: 4 }}>PRODUCT</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>{reservation.inventory.product.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginTop: 2 }}>{reservation.inventory.product.sku}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginBottom: 4 }}>WAREHOUSE</div>
                <div style={{ fontSize: 15, fontWeight: 500, color: "var(--text-primary)" }}>{reservation.inventory.warehouse.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                  <MapPin size={11} />{reservation.inventory.warehouse.location}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginBottom: 4 }}>QUANTITY</div>
                <div style={{ fontSize: 24, fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{reservation.quantity}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginBottom: 4 }}>CREATED</div>
                <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{format(new Date(reservation.createdAt), "MMM d, yyyy HH:mm")}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{formatDistanceToNow(new Date(reservation.createdAt), { addSuffix: true })}</div>
              </div>
            </div>

            {/* Countdown */}
            {isPending && (
              <div style={{ background: isUrgent ? "rgba(239,68,68,0.06)" : "rgba(245,158,11,0.06)", border: `1px solid ${isUrgent ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)"}`, borderRadius: 8, padding: "16px 20px", marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "var(--font-mono)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                  <Clock size={11} /> TIME REMAINING
                </div>
                <div
                  className={isUrgent ? "countdown-urgent" : ""}
                  style={{ fontFamily: "var(--font-mono)", fontSize: 40, fontWeight: 600, color: isUrgent ? "var(--accent-red)" : "var(--accent-amber)", lineHeight: 1, letterSpacing: "-0.02em" }}
                >
                  {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
                </div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>
                  Expires {format(new Date(reservation.expiresAt), "HH:mm:ss")}{isUrgent ? " — Confirm now!" : ""}
                </div>
              </div>
            )}

            {isConfirmed && (
              <div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
                <CheckCircle2 size={24} style={{ color: "var(--accent-green)", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--accent-green)" }}>Purchase Confirmed</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Your order has been placed. Stock permanently allocated.</div>
                </div>
              </div>
            )}

            {reservation.status === "EXPIRED" && (
              <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 8, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
                <AlertTriangle size={24} style={{ color: "var(--accent-red)", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--accent-red)" }}>Reservation Expired</div>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>Hold timed out. Stock returned to pool.</div>
                </div>
              </div>
            )}

            {reservation.status === "RELEASED" && (
              <div style={{ background: "rgba(139,148,166,0.06)", border: "1px solid rgba(139,148,166,0.2)", borderRadius: 8, padding: "16px 20px", marginBottom: 20, display: "flex", alignItems: "center", gap: 12 }}>
                <XCircle size={24} style={{ color: "var(--text-secondary)", flexShrink: 0 }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-secondary)" }}>Reservation Cancelled</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>Stock returned to pool.</div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            {isPending && (
              <div style={{ display: "flex", gap: 12 }}>
                <button className="btn-danger" style={{ flex: 1 }} onClick={handleCancel} disabled={!!actionLoading}>
                  {actionLoading === "cancel" ? "Cancelling…" : "Cancel"}
                </button>
                <button className="btn-primary" style={{ flex: 2 }} onClick={handleConfirm} disabled={!!actionLoading || isExpired}>
                  {actionLoading === "confirm" ? "Confirming…" : "✓ Confirm Purchase"}
                </button>
              </div>
            )}

            {!isPending && (
              <button className="btn-ghost" style={{ width: "100%" }} onClick={() => router.push("/")}>
                Back to Products
              </button>
            )}
          </div>
        </div>

        {/* ── Right panel: timeline ─────────────────────────────────────── */}
        <div className="card" style={{ padding: 20 }}>
          <AuditTimeline logs={reservation.auditLogs} />
        </div>
      </div>
    </div>
  );
}
