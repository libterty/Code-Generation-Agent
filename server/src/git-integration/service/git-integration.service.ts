import { RequestCommitGitDto, ResponseCommitGitDto } from '@server/git-integration/dto/commit-git.dto';

export interface GitIntegrationService {
  commitToGit(dto: RequestCommitGitDto): Promise<ResponseCommitGitDto>;
}