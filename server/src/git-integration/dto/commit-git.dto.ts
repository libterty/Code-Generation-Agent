import { RequirementTask } from '.prisma/client';
import { ResponseQualityCheckDto } from '@server/quality-check/dto/quality-check.dto';

export class RequestCommitGitDto {
  task: RequirementTask;
  qualityResult: ResponseQualityCheckDto;
  generatedCode: Record<string, string>;
  outputPath: string;
  requirementAnalysis: Record<string, any>;
}

export class ResponseCommitGitDto {
  commitHash: string;
  filesChanged: string[];
}
