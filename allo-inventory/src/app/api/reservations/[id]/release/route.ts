// src/app/api/reservations/[id]/release/route.ts
import { NextResponse } from "next/server";
import { releaseReservation } from "@/services/reservation.service";
import { withErrorHandling } from "@/lib/api";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    const { id } = await params;
    const reservation = await releaseReservation(id);
    return NextResponse.json({ data: reservation });
  });
}
