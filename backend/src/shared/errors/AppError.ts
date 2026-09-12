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
export const revisionConflict = (message = 'The resource changed. Refresh and try again.') => new AppError(412, 'REVISION_CONFLICT', message)
export const validationError = (message = 'The request could not be validated.', fields?: ErrorFields) => new AppError(422, 'VALIDATION_ERROR', message, fields)
export const preconditionRequired = (message = 'A resource version is required.') => new AppError(428, 'PRECONDITION_REQUIRED', message)
export const rateLimited = (message = 'Too many requests.') => new AppError(429, 'RATE_LIMITED', message)
