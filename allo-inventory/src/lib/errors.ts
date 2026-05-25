// src/lib/errors.ts
// Typed domain errors — each maps directly to an HTTP status code
// API route handlers catch these and return the correct response shape

export type ErrorCode =
  | "INSUFFICIENT_STOCK"
  | "RESERVATION_EXPIRED"
  | "RESERVATION_NOT_FOUND"
  | "RESERVATION_INVALID_STATE"
  | "INVALID_REQUEST"
  | "DUPLICATE_IDEMPOTENCY_KEY"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class InsufficientStockError extends AppError {
  constructor(available: number, requested: number) {
    super(
      "INSUFFICIENT_STOCK",
      409,
      `Requested ${requested} units but only ${available} are available`
    );
  }
}

export class ReservationExpiredError extends AppError {
  constructor(reservationId: string) {
    super(
      "RESERVATION_EXPIRED",
      410,
      `Reservation ${reservationId} has expired`
    );
  }
}

export class ReservationNotFoundError extends AppError {
  constructor(reservationId: string) {
    super(
      "RESERVATION_NOT_FOUND",
      404,
      `Reservation ${reservationId} not found`
    );
  }
}

export class ReservationInvalidStateError extends AppError {
  constructor(currentStatus: string, expectedStatus: string) {
    super(
      "RESERVATION_INVALID_STATE",
      422,
      `Reservation is ${currentStatus}, expected ${expectedStatus}`
    );
  }
}

export class InvalidRequestError extends AppError {
  constructor(message: string) {
    super("INVALID_REQUEST", 400, message);
  }
}

/** Typed API response envelope */
export type ApiSuccess<T> = { data: T };
export type ApiError = { error: ErrorCode; message?: string };
export type ApiResponse<T> = ApiSuccess<T> | ApiError;
