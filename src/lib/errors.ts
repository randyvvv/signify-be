import type { ContentfulStatusCode } from "hono/utils/http-status";

/**
 * Error aplikasi yang membawa HTTP status + kode mesin.
 * Dilempar dari service/route, ditangkap oleh app.onError dan diubah
 * menjadi JSON { error, code } yang konsisten.
 */
export class AppError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    message: string,
    public code?: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (message: string, code = "bad_request") =>
  new AppError(400, message, code);
export const unauthorized = (message = "Token tidak valid", code = "unauthorized") =>
  new AppError(401, message, code);
export const forbidden = (message = "Tidak diizinkan", code = "forbidden") =>
  new AppError(403, message, code);
export const notFound = (message = "Tidak ditemukan", code = "not_found") =>
  new AppError(404, message, code);
export const conflict = (message: string, code = "conflict") =>
  new AppError(409, message, code);
export const serviceUnavailable = (message: string, code = "service_unavailable") =>
  new AppError(503, message, code);
