import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule } from '@nestjs/config';
import { authConfig } from '@server/config/auth.config';
import { dbConfig } from '@server/config/db.config';
import { llMConfig } from '@server/config/llm.config';
import { configValidator } from '@server/config/config.validator';
import { gitConfig } from '@server/config/git.config';
import { redisConfig } from '@server/config/redis.config';
import { taskQueueConfig } from '@server/config/task-queue.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [authConfig, dbConfig, llMConfig, gitConfig, redisConfig, taskQueueConfig],
      validate: configValidator,
    }),
    EventEmitterModule.forRoot(),
  ],
})
export class AppModule {}
