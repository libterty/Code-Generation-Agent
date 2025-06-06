import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { RequirementTaskModule } from '@server/requirement-task/requirement-task.module';
import { GitIntegrationServiceImpl } from '@server/git-integration/service/impl/git-integration-impl.service';
import { CodeCommitProcessorImpl } from './event-listener/processor/impl/code-commit-impl.processor';
import { CodeCommitEventListener } from './event-listener/code-commit-event.listener';
import {
  GIT_INTEGRATION_SERVICE,
  CODE_COMMIT_PROCESSOR,
} from '@server/constants';

const providers = [
  {
    provide: GIT_INTEGRATION_SERVICE,
    useClass: GitIntegrationServiceImpl,
  },
  {
    provide: CODE_COMMIT_PROCESSOR,
    useClass: CodeCommitProcessorImpl,
  },
  CodeCommitEventListener,
];

@Module({
  imports: [HttpModule, RequirementTaskModule],
  providers,
  exports: providers,
})
export class GitIntegrationModule {}
