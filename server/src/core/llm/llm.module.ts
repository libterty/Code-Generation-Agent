import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LLmServiceImpl } from '@server/core/llm/service/impl/llm-impl.service';
import { LLM_SERVICE } from '@server/constants';

const providers = [
  {
    provide: LLM_SERVICE,
    useClass: LLmServiceImpl,
  },
];

@Module({
  imports: [
    HttpModule,
  ],
  providers,
  exports: providers,
})
export class LLMModule {}
