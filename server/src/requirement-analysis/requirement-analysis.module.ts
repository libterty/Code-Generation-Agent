
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '@server/core/prisma/prisma.module';
import { RequirementAnalysisServiceImpl } from '@server/requirement-analysis/service/impl/requirement-analysis-impl.service';
import {
  REQUIREMENT_ANALYSIS_SERVICE
} from '@server/constants';

const providers = [
  {
    provide: REQUIREMENT_ANALYSIS_SERVICE,
    useClass: RequirementAnalysisServiceImpl,
  },
];

@Module({
  imports: [
    HttpModule,
    PrismaModule,
  ],
  controllers: [],
  providers,
  exports: providers,
})
export class RequirementAnalysisModule {}
