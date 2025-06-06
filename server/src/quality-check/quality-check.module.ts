import { Module } from '@nestjs/common';
import { PrismaModule } from '@server/core/prisma/prisma.module';
import { LLMModule } from '@server/core/llm/llm.module';
import { QualityCheckServiceImpl } from '@server/quality-check/service/impl/quality-check-impl.service';
import { QUALITY_CHECK_SERVICE } from '@server/constants';

const providers = [
  {
    provide: QUALITY_CHECK_SERVICE,
    useClass: QualityCheckServiceImpl,
  },
];

@Module({
  imports: [PrismaModule, LLMModule],
  providers,
  exports: providers,
})
export class QualityCheckModule {}
