import { Module } from '@nestjs/common';
export { Cluster, RedisOptions } from 'ioredis';
import { RedisRepository } from '@server/core/redis-client/redis.repository';
import { REDIS_REPOSITORY } from '@server/constants';


@Module({
  providers: [
    {
      provide: REDIS_REPOSITORY,
      useClass: RedisRepository,
    },
  ],
  exports: [
    {
      provide: REDIS_REPOSITORY,
      useClass: RedisRepository,
    },
  ],
})
export class RedisClientModule {}
