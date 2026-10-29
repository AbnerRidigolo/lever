import { z } from 'zod';

export const ERROR_CODES = [
  'bad_request',
  'validation_failed',
  'unauthorized',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'internal',
  'service_unavailable',
] as const;
export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

/** HTTP status returned with each error code. */
export const ERROR_HTTP_STATUS = {
  bad_request: 400,
  validation_failed: 422,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
  service_unavailable: 503,
} as const satisfies Record<ErrorCode, number>;

export const errorDetailSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type ErrorDetail = z.infer<typeof errorDetailSchema>;

/** Standard error body returned by every Lever service. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string().min(1),
    details: z.array(errorDetailSchema).optional(),
    requestId: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

export interface ApiErrorOptions {
  details?: ErrorDetail[];
  requestId?: string;
}

export function createApiError(
  code: ErrorCode,
  message: string,
  options: ApiErrorOptions = {},
): ApiError {
  return {
    error: {
      code,
      message,
      ...(options.details === undefined ? {} : { details: options.details }),
      ...(options.requestId === undefined ? {} : { requestId: options.requestId }),
    },
  };
}

/** Converts a Zod validation failure into a `validation_failed` error. */
export function createValidationError(error: z.ZodError, requestId?: string): ApiError {
  const details = error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
  return createApiError('validation_failed', 'Request validation failed', {
    details,
    ...(requestId === undefined ? {} : { requestId }),
  });
}
