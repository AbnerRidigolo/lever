import type { ErrorCode, ErrorDetail } from '@lever/schemas';

/** Failure of a console operation, in terms of the standard error codes. */
export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetail[] | undefined;

  constructor(code: ErrorCode, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

const PG_UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: unknown): boolean {
  // Drizzle wraps the driver error in `cause`.
  for (let current = error; current instanceof Error; current = current.cause) {
    if ('code' in current && current.code === PG_UNIQUE_VIOLATION) return true;
  }
  return false;
}
