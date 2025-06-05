import { registerAs } from '@nestjs/config';
import { RedisOptions } from 'ioredis';

export const redisConfig = registerAs<RedisOptions>('redis', () => ({
  host: process.env.REDIS_HOST,
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB, 10) || 0,
}));
