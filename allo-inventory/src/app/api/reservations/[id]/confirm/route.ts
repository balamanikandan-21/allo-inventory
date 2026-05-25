// src/app/api/reservations/[id]/confirm/route.ts
import { NextResponse } from "next/server";
import { confirmReservation } from "@/services/reservation.service";
import { withErrorHandling, getIdempotencyKey } from "@/lib/api";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(async () => {
    const { id } = await params;
    const idempotencyKey = getIdempotencyKey(request);

    const reservation = await confirmReservation({
      reservationId: id,
      idempotencyKey,
    });

    return NextResponse.json({ data: reservation });
  });
}
