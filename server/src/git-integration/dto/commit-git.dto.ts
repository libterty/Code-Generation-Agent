export class RequestCommitGitDto {
  repositoryUrl: string;
  branch: string;
  generatedCode: Record<string, string>;
  outputPath: string;
  requirementText: string;
  requirementAnalysis: Record<string, any>;
}

export class ResponseCommitGitDto {
  commitHash: string;
  filesChanged: string[];
}
