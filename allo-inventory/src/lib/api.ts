// src/lib/api.ts
// Shared utilities for API route handlers

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./errors";
import type { ErrorCode } from "./errors";

/** Wraps an async route handler with standard error handling */
export function withErrorHandling<T>(
  handler: () => Promise<NextResponse<T>>
): Promise<NextResponse<T> | NextResponse<{ error: ErrorCode; message?: string }>> {
  return handler().catch((err) => {
    if (err instanceof AppError) {
      return NextResponse.json(
        { error: err.code, message: err.message },
        { status: err.statusCode }
      ) as NextResponse<{ error: ErrorCode; message?: string }>;
    }

    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          error: "INVALID_REQUEST" as ErrorCode,
          message: err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; "),
        },
        { status: 400 }
      ) as NextResponse<{ error: ErrorCode; message?: string }>;
    }

    console.error("[API Error]", err);
    return NextResponse.json(
      { error: "INTERNAL_ERROR" as ErrorCode, message: "An unexpected error occurred" },
      { status: 500 }
    ) as NextResponse<{ error: ErrorCode; message?: string }>;
  });
}

/** Extracts Idempotency-Key header from a Request */
export function getIdempotencyKey(request: Request): string | undefined {
  return request.headers.get("Idempotency-Key") ?? undefined;
}
