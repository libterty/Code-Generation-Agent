import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '.prisma/client';

export class PrismaRepository
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  public constructor() {
    super({
      log: PrismaRepository.logLevel(),
    });
  }

  public async onModuleInit() {
    await this.$connect();
  }

  public async onModuleDestroy() {
    await this.$disconnect();
  }

  private static logLevel(): Prisma.LogLevel[] {
    if (process.env.NODE_ENV === 'production') {
      return ['warn', 'error'];
    }

    return ['query', 'info', 'warn', 'error'];
  }
}
