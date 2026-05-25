// src/app/api/reservations/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createReservation } from "@/services/reservation.service";
import { withErrorHandling, getIdempotencyKey } from "@/lib/api";

const CreateReservationSchema = z.object({
  productId: z.string().min(1, "productId is required"),
  warehouseId: z.string().min(1, "warehouseId is required"),
  quantity: z.number().int().positive("quantity must be a positive integer"),
  customerEmail: z.string().email("invalid email").optional(),
});

export async function POST(request: Request) {
  return withErrorHandling(async () => {
    const body = await request.json();
    const params = CreateReservationSchema.parse(body);
    const idempotencyKey = getIdempotencyKey(request);

    const reservation = await createReservation({ ...params, idempotencyKey });

    return NextResponse.json({ data: reservation }, { status: 201 });
  });
}
