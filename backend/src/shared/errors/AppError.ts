export type ErrorFields = Record<string, string>

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly fields?: ErrorFields,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const badRequest = (message = 'The request is invalid.', fields?: ErrorFields) => new AppError(400, 'MALFORMED_REQUEST', message, fields)
export const notFound = (message = 'The requested resource was not found.') => new AppError(404, 'NOT_FOUND', message)
export const conflict = (message = 'The request conflicts with the current state.') => new AppError(409, 'STATE_CONFLICT', message)
export const idempotencyConflict = () => new AppError(409, 'IDEMPOTENCY_CONFLICT', 'The Idempotency-Key was already used with a different request.')
export const revisionConflict = (message = 'The resource changed. Refresh and try again.') => new AppError(412, 'REVISION_CONFLICT', message)
export const validationError = (message = 'The request could not be validated.', fields?: ErrorFields) => new AppError(422, 'VALIDATION_ERROR', message, fields)
export const preconditionRequired = (message = 'A resource version is required.') => new AppError(428, 'PRECONDITION_REQUIRED', message)
export const rateLimited = (message = 'Too many requests.') => new AppError(429, 'RATE_LIMITED', message)
export const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.')
export const unauthenticated = (message = 'Authentication is required.') => new AppError(401, 'UNAUTHENTICATED', message)
export const csrfInvalid = () => new AppError(403, 'CSRF_INVALID', 'The CSRF token is missing or invalid.')
export const forbidden = (message = 'The request origin is not allowed.') => new AppError(403, 'FORBIDDEN', message)
