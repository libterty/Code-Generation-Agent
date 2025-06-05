import { CommonErrorCode } from './common-error-code';

export abstract class AppError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string) {
    super(message);
    this.code = code;
    // The stack trace shouldn't contain the constructor call.
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Common errors
 */
export class ConfigError extends AppError {
  public constructor(message: string) {
    super(CommonErrorCode.ConfigError, message);
  }
}

export class NotFoundError extends AppError {
  public constructor(message: string) {
    super(CommonErrorCode.NotFoundError, message);
  }
}

export class ValidationError extends AppError {
  public constructor(message: string) {
    super(CommonErrorCode.ValidationError, message);
  }
}

export class ConflictError extends AppError {
  public constructor(message: string) {
    super(CommonErrorCode.ConflictError, message);
  }
}

export class UnknownError extends AppError {
  public constructor(message: string) {
    super(CommonErrorCode.UnknownError, message);
  }
}

export class TooManyRequestError extends AppError {
  public constructor(message: string) {
    super(CommonErrorCode.TooManyRequestError, message);
  }
}

export class UnauthorizedError extends AppError {
  public constructor(message: string) {
    super(CommonErrorCode.UnauthorizedError, message);
  }
}

export class ForbiddenError extends AppError {
  public constructor(message: string) {
    super(CommonErrorCode.ForbiddenError, message);
  }
}
