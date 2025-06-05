import { HttpStatus } from '@nestjs/common';

import { ErrorToHttpExceptionInterceptor } from '@server/core/interceptor';

export class AppErrorToHttpExceptionInterceptor extends ErrorToHttpExceptionInterceptor {
  protected mapErrorCodeToHttpStatus(code: string): HttpStatus | null {
    switch (code) {
      default:
        return null;
    }
  }
}
