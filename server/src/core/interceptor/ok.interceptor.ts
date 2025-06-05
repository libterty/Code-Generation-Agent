import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export type Response = {
  message: 'ok';
};

@Injectable()
export class OkInterceptor<T> implements NestInterceptor<T, Response> {
  public intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response> {
    return next.handle().pipe(
      map(() => ({
        message: 'ok',
      })),
    );
  }
}
