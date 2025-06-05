import { Module } from '@nestjs/common';

import { PrismaRepository } from './prisma-repository';
import { PRISMA_REPOSITORY } from '@server/constants';

@Module({
  providers: [
    {
      provide: PRISMA_REPOSITORY,
      useClass: PrismaRepository,
    },
  ],
  exports: [
    {
      provide: PRISMA_REPOSITORY,
      useClass: PrismaRepository,
    },
  ],
})
export class PrismaModule {}
