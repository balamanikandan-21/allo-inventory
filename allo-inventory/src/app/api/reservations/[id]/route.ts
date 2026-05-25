// src/app/api/reservations/[id]/route.ts
import { NextResponse } from "next/server";
import { getReservation } from "@/services/reservation.service";
import { withErrorHandling } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    const { id } = await params;
    const reservation = await getReservation(id);
    return NextResponse.json({ data: reservation });
  });
}
