import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GitIntegrationServiceImpl } from '@server/git-integration/service/impl/git-integration-impl.service'
import { GIT_INTEGRATION_SERVICE } from '@server/constants';

const providers = [
  {
    provide: GIT_INTEGRATION_SERVICE,
    useClass: GitIntegrationServiceImpl,
  },
];

@Module({
  imports: [
    HttpModule,
  ],
  providers,
  exports: providers,
})
export class GitIntegrationModule {}
