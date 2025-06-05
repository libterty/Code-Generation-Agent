import {
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Observable, iif, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

import { AppError, CommonErrorCode, toErrorResponse } from '@server/core/error';

export abstract class ErrorToHttpExceptionInterceptor
  implements NestInterceptor
{
  private readonly logger = new Logger(this.constructor.name);

  protected abstract mapErrorCodeToHttpStatus(code: string): HttpStatus | null;

  public intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {
    return next.handle().pipe(
      catchError((err) =>
        iif(
          () => this.isHttpContext(context),
          throwError(() => this.mapToHttpException(err)),
          throwError(() => err),
        ),
      ),
    );
  }

  private isHttpContext(context: ExecutionContext): boolean {
    return context.getType() === 'http';
  }

  private isAppError(exception: unknown): exception is AppError {
    return exception instanceof AppError;
  }

  private getHttpStatusByErrorCode(code: string): HttpStatus {
    const httpStatus = this.mapErrorCodeToHttpStatus(code);
    if (httpStatus) return httpStatus;

    // Fallback to the common mapper
    switch (code) {
      case CommonErrorCode.ValidationError:
        return HttpStatus.BAD_REQUEST;
      case CommonErrorCode.UnauthorizedError:
        return HttpStatus.UNAUTHORIZED;
      case CommonErrorCode.ForbiddenError:
        return HttpStatus.FORBIDDEN;
      case CommonErrorCode.NotFoundError:
        return HttpStatus.NOT_FOUND;
      case CommonErrorCode.ConflictError:
        return HttpStatus.CONFLICT;
      default:
        return this.defaultHttpStatus();
    }
  }

  private mapToHttpException(err: any): HttpException {
    let status: number;
    let code: string;
    let message: string;

    if (this.isAppError(err)) {
      status = this.getHttpStatusByErrorCode(err.code);
      code = err.code;
      message = this.hideErrorStackInProduction(err.message, status);
    } else {
      status = this.defaultHttpStatus();
      code = this.defaultErrorCode();
      message = (err as any).stack
        ? this.hideErrorStackInProduction((err as any).stack, status)
        : this.defaultErrorMessage();

      this.logger.error(err);
    }

    return new HttpException(toErrorResponse(code, message), status);
  }

  private hideErrorStackInProduction(
    message: string,
    status: HttpStatus,
  ): string {
    if (
      process.env.NODE_ENV === 'production' &&
      status === HttpStatus.INTERNAL_SERVER_ERROR
    ) {
      return this.defaultErrorMessage();
    }

    return message;
  }

  private defaultHttpStatus(): HttpStatus {
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private defaultErrorCode(): CommonErrorCode {
    return CommonErrorCode.UnknownError;
  }

  private defaultErrorMessage(): string {
    return 'The server is temporarily unable to service your request.';
  }
}
