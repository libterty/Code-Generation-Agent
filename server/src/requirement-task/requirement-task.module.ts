// src/requirement-task/requirement-task.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '@server/core/prisma/prisma.module';
import { RedisClientModule } from '@server/core/redis-client/redis-client.module';
import { RequirementQueueServiceImpl } from '@server/requirement-task/service/impl/requirement-queue-impl.service';
import { RequirementTaskController } from '@server/requirement-task/controller/requirement-task.controller';
import { redisConfig } from '@server/config/redis.config';
import {
  REQUIREMENT_QUEUE_SERVICE,
  REQUIREMENT_TASK_SERVICE,
} from '@server/constants';
import { RequirementTaskServiceImpl } from './service/impl/requirement-task-impl.service';

const providers = [
  {
    provide: REQUIREMENT_QUEUE_SERVICE,
    useClass: RequirementQueueServiceImpl,
  },
  {
    provide: REQUIREMENT_TASK_SERVICE,
    useClass: RequirementTaskServiceImpl,
  },
];

@Module({
  imports: [
    ConfigModule.forFeature(redisConfig),
    HttpModule,
    PrismaModule,
    RedisClientModule,
  ],
  controllers: [RequirementTaskController],
  providers: providers,
  exports: providers,
})
export class RequirementTaskModule {}
