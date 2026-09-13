/** Typed application errors mapped to HTTP status codes. */

export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(400, 'validation_error', message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'unauthorized', message);
  }
}

/**
 * Returned for cross-tenant access attempts.
 *
 * We deliberately return 403 rather than 404 so that the attempt is
 * unambiguous in logs and can be alerted on. The message never reveals
 * whether the resource exists.
 */
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have access to this resource') {
    super(403, 'forbidden', message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(404, 'not_found', `${resource} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(409, 'conflict', message, details);
  }
}

/** Inventory ran out between quote and confirmation. */
export class InventoryUnavailableError extends AppError {
  constructor(details?: Record<string, unknown>) {
    super(
      409,
      'inventory_unavailable',
      'Those dates were just booked by someone else. Please pick different dates or another room.',
      details,
    );
  }
}

/** Client-displayed total did not match the server recomputation. */
export class PriceChangedError extends AppError {
  constructor(expectedPaise: number, actualPaise: number) {
    super(409, 'price_changed', 'The price for these dates has changed. Please review the new total.', {
      expectedPaise,
      actualPaise,
    });
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterSeconds = 60) {
    super(429, 'rate_limited', 'Too many requests. Please try again shortly.', { retryAfterSeconds });
  }
}

export class UpstreamError extends AppError {
  constructor(service: string) {
    super(502, 'upstream_error', `${service} is temporarily unavailable. Please try again.`);
  }
}
