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
export const reviewLocked = () => new AppError(409, 'REVIEW_LOCKED', 'Reviewed Content is locked. Request Revision before making review-affecting changes.')
export const assetInUse = () => new AppError(409, 'ASSET_IN_USE', 'The Asset is still attached and cannot be deleted.')
export const storageFailure = () => new AppError(500, 'INTERNAL_ERROR', 'The Asset storage operation could not be completed.')
export const payloadTooLarge = (message = 'The uploaded file is too large.') => new AppError(413, 'PAYLOAD_TOO_LARGE', message)
export const unsupportedMedia = (message = 'The uploaded media type is not supported.') => new AppError(415, 'UNSUPPORTED_MEDIA_TYPE', message)
export const idempotencyConflict = () => new AppError(409, 'IDEMPOTENCY_CONFLICT', 'The Idempotency-Key was already used with a different request.')
export const revisionConflict = (message = 'The resource changed. Refresh and try again.') => new AppError(412, 'REVISION_CONFLICT', message)
export const validationError = (message = 'The request could not be validated.', fields?: ErrorFields) => new AppError(422, 'VALIDATION_ERROR', message, fields)
export const preconditionRequired = (message = 'A resource version is required.') => new AppError(428, 'PRECONDITION_REQUIRED', message)
export const rateLimited = (message = 'Too many requests.') => new AppError(429, 'RATE_LIMITED', message)
export const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password.')
export const unauthenticated = (message = 'Authentication is required.') => new AppError(401, 'UNAUTHENTICATED', message)
export const csrfInvalid = () => new AppError(403, 'CSRF_INVALID', 'The CSRF token is missing or invalid.')
export const forbidden = (message = 'The request origin is not allowed.') => new AppError(403, 'FORBIDDEN', message)
export const aiNotConfigured = () => new AppError(503, 'AI_NOT_CONFIGURED', 'The AI provider is not configured.')
export const integrationNotConfigured = () => new AppError(503, 'INTEGRATION_NOT_CONFIGURED', 'The integration is not configured.')
export const instagramAccountInvalid = () => new AppError(422, 'INSTAGRAM_ACCOUNT_INVALID', 'The configured Instagram account could not be validated.')
export const instagramProviderError = () => new AppError(502, 'INSTAGRAM_PROVIDER_ERROR', 'The Instagram API request could not be completed.')
export const aiTimeout = () => new AppError(504, 'AI_TIMEOUT', 'The AI provider did not respond within the configured timeout.')
export const aiProviderError = () => new AppError(502, 'AI_PROVIDER_ERROR', 'The AI provider request failed.')
export const aiOutputInvalid = (message = 'The AI provider returned an invalid structured result.') => new AppError(502, 'AI_OUTPUT_INVALID', message)
export const inputChanged = (aiRequestId: string) => new AppError(409, 'INPUT_CHANGED', 'The saved context changed while the AI request was running.', { aiRequestId })
export const requestInProgress = (aiRequestId: string) => new AppError(409, 'REQUEST_IN_PROGRESS', 'An AI request with this Idempotency-Key is already running.', { aiRequestId })
export const productContextIncomplete = (missing: string[]) => new AppError(422, 'PRODUCT_CONTEXT_INCOMPLETE', 'Complete the Product Context before generating content.', { missing: missing.join(',') })
export const inputNotReady = (missing: string[]) => new AppError(422, 'INPUT_NOT_READY', 'The saved Content Context is not ready for generation.', { missing: missing.join(',') })
export const discoveryCompanyContextIncomplete = (missing: string[]) => new AppError(422, 'DISCOVERY_COMPANY_CONTEXT_INCOMPLETE', 'Complete the Company Context before discovering topics.', { missing: missing.join(',') })
export const discoveryProductContextIncomplete = (missing: string[]) => new AppError(422, 'DISCOVERY_PRODUCT_CONTEXT_INCOMPLETE', 'Complete the selected Product Context before discovering topics.', { missing: missing.join(',') })
export const discoveryPromptUnavailable = () => new AppError(503, 'DISCOVERY_NOT_CONFIGURED', 'Current Topic Discovery is not configured for this environment.')
