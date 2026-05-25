// src/app/api/cron/expire-reservations/route.ts
// Vercel Cron — runs every minute (configured in vercel.json).
// Security: CRON_SECRET prevents external callers from triggering batch expiry.

import { NextResponse } from "next/server";
import { expireStaleReservations } from "@/services/reservation.service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await expireStaleReservations();
    console.log(`[Cron] Expired ${result.expired} reservations`, result.ids);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[Cron] Expiry failed", err);
    return NextResponse.json({ error: "Cron failed" }, { status: 500 });
  }
}
