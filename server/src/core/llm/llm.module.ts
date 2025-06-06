import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LLmServiceImpl } from '@server/core/llm/service/impl/llm-impl.service';
import { LlmIntegrationServiceImpl } from '@server/core/llm/service/impl/llm-integration-imp.service';
import { LLM_SERVICE, LLM_INTEGRATION_SERVICE } from '@server/constants';

const providers = [
  {
    provide: LLM_SERVICE,
    useClass: LLmServiceImpl,
  },
  {
    provide: LLM_INTEGRATION_SERVICE,
    useClass: LlmIntegrationServiceImpl,
  },
];

@Module({
  imports: [HttpModule],
  providers,
  exports: providers,
})
export class LLMModule {}
