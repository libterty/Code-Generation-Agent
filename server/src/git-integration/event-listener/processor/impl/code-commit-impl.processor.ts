import { Injectable, Inject, Logger } from '@nestjs/common';
import { RequirementStatus } from '.prisma/client';
import { EventProcessorStrategy } from '@server/core/event/event.listener';
import { CodeCommitdEvent } from '@server/git-integration/event/code-commit.event';
import { GitIntegrationService } from '@server/git-integration/service/git-integration.service';
import { RequirementTaskService } from '@server/requirement-task/service/requirement-task.service';
import { ResponseCommitGitDto } from '@server/git-integration/dto/commit-git.dto';
import {
  GIT_INTEGRATION_SERVICE,
  REQUIREMENT_TASK_SERVICE,
} from '@server/constants';

@Injectable()
export class CodeCommitProcessorImpl
  implements EventProcessorStrategy<CodeCommitdEvent, ResponseCommitGitDto>
{
  private readonly logger = new Logger(CodeCommitProcessorImpl.name);

  constructor(
    @Inject(GIT_INTEGRATION_SERVICE)
    private readonly gitIntegrationService: GitIntegrationService,

    @Inject(REQUIREMENT_TASK_SERVICE)
    private readonly requirementTaskService: RequirementTaskService,
  ) {}

  /**
   * Process the code commit event
   * @param event CodeCommitdEvent containing all necessary data for the commit
   * @returns ResponseCommitGitDto with commit results
   */
  public async processEvent(
    event: CodeCommitdEvent,
  ): Promise<ResponseCommitGitDto> {
    this.logger.log(`Processing commit for task ${event.taskId}`);

    // Extract necessary data from the event
    const {
      task,
      qualityResult,
      generatedCode,
      outputPath,
      requirementAnalysis,
    } = event.payload;

    // Update task status to show we're committing
    await this.requirementTaskService.updateTaskStatus({
      taskId: event.taskId,
      status: RequirementStatus.in_progress,
      progress: 0.8,
      details: {
        message: 'Committing code to repository',
      },
    });

    // Perform type validation for generatedCode to ensure it's Record<string, string>
    const typedGeneratedCode: Record<string, string> = {};
    let validCode = true;

    for (const [filePath, content] of Object.entries(generatedCode)) {
      if (typeof filePath === 'string' && typeof content === 'string') {
        typedGeneratedCode[filePath] = content;
      } else {
        this.logger.warn(
          `Invalid entry in generated code: ${filePath} -> ${typeof content}`,
        );
        validCode = false;
        break;
      }
    }

    if (!validCode || Object.keys(typedGeneratedCode).length === 0) {
      throw new Error('Generated code contains invalid entries');
    }

    // Commit the code to Git
    const commitResult = await this.gitIntegrationService.commitToGit({
      task,
      qualityResult,
      generatedCode: typedGeneratedCode,
      outputPath,
      requirementAnalysis,
    });

    // Log the commit result
    this.logger.log(
      `Commit successful for task ${event.taskId}: ${commitResult.commitHash}`,
    );

    return commitResult;
  }

  /**
   * Mark the task as completed (used for clean-up operations)
   * This is typically called after processing is successful but no status update needed
   * since the listener already handles the final status update
   */
  async markTaskCompleted(
    event: CodeCommitdEvent,
    commitResult: ResponseCommitGitDto,
  ): Promise<void> {
    // In this implementation, we don't need to do anything here
    await this.requirementTaskService.updateTaskStatus({
      taskId: event.taskId,
      status: RequirementStatus.completed,
      progress: 1.0,
      details: {
        message:
          'Code generated, quality verified, and committed to repository',
        commitHash: commitResult.commitHash,
        filesChanged: commitResult.filesChanged,
        qualityPassed: event.payload.qualityResult.passed,
        qualityScores: {
          overall:
            event.payload.qualityResult.codeQualityScore * 0.5 +
            event.payload.qualityResult.requirementCoverageScore * 0.3 +
            event.payload.qualityResult.syntaxValidityScore * 0.2,
          codeQuality: event.payload.qualityResult.codeQualityScore,
          requirementCoverage:
            event.payload.qualityResult.requirementCoverageScore,
          syntaxValidity: event.payload.qualityResult.syntaxValidityScore,
        },
      },
    });
    // since the listener will handle the final status update
    this.logger.debug(
      `Task ${event.taskId} completed processing in commit processor`,
    );
  }

  /**
   * Mark the task as failed when an error occurs
   * @param event The original event
   * @param error The error that occurred
   */
  async markTaskFailed(event: CodeCommitdEvent, error: Error): Promise<void> {
    await this.requirementTaskService.updateTaskStatus({
      taskId: event.taskId,
      status: RequirementStatus.failed,
      progress: 0,
      details: {
        error: `Failed to commit code: ${error.message}`,
        stage: 'code_commit',
      },
    });
  }
}
