import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export type DataResponse<T> = {
  data: T;
};

@Injectable()
export class DataInterceptor<T> implements NestInterceptor<T, DataResponse<T>> {
  public intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<DataResponse<T>> {
    return next.handle().pipe(
      map((data) => ({
        data,
      })),
    );
  }
}
