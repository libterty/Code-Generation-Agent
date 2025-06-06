import { Module } from '@nestjs/common';
import { PrismaModule } from '@server/core/prisma/prisma.module';
import { LLMModule } from '@server/core/llm/llm.module';
import { RequirementTaskModule } from '@server/requirement-task/requirement-task.module';
import { GitIntegrationModule } from '@server/git-integration/git-integration.module';
import { QualityCheckModule } from '@server/quality-check/quality-check.module';
import { CodeGenerationServiceImpl } from '@server/code-generation/service/impl/code-generation-imp.service';
import { CodeGenerationProcessorImpl } from '@server/code-generation/event-listener/processor/impl/code-generate-impl.processor';
import { CodeGenerateEventListener } from '@server/code-generation/event-listener/code-generate-event.listener';
import {
  CODE_GENERATION_SERVICE,
  CODE_GENERATION_PROCESSOR,
} from '@server/constants';

const providers = [
  {
    provide: CODE_GENERATION_SERVICE,
    useClass: CodeGenerationServiceImpl,
  },
  {
    provide: CODE_GENERATION_PROCESSOR,
    useClass: CodeGenerationProcessorImpl,
  },
  CodeGenerateEventListener,
];

@Module({
  imports: [
    PrismaModule,
    LLMModule,
    RequirementTaskModule,
    GitIntegrationModule,
    QualityCheckModule,
  ],
  providers,
  exports: providers,
})
export class CodeGenerationModule {}
