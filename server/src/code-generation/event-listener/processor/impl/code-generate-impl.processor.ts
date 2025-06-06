import { Injectable, Inject, Logger } from '@nestjs/common';
import { RequirementStatus, CodeLanguage } from '.prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CodeGeneratedEvent } from '@server/code-generation/event/code-generate.event';
import { EventProcessorStrategy } from '@server/core/event/event.listener';
import { RequirementTaskService } from '@server/requirement-task/service/requirement-task.service';
import { QualityCheckService } from '@server/quality-check/service/quality-check.service';
import { CodeCommitdEvent } from '@server/git-integration/event/code-commit.event';
import { ResponseQualityCheckDto } from '@server/quality-check/dto/quality-check.dto';
import {
  REQUIREMENT_TASK_SERVICE,
  QUALITY_CHECK_SERVICE,
} from '@server/constants';

@Injectable()
export class CodeGenerationProcessorImpl
  implements
    EventProcessorStrategy<CodeGeneratedEvent, ResponseQualityCheckDto>
{
  private readonly logger = new Logger(CodeGenerationProcessorImpl.name);

  constructor(
    private eventEmitter: EventEmitter2,

    @Inject(REQUIREMENT_TASK_SERVICE)
    private readonly requirementTaskService: RequirementTaskService,

    @Inject(QUALITY_CHECK_SERVICE)
    private readonly qualityCheckService: QualityCheckService,
  ) {}

  public async processEvent(
    event: CodeGeneratedEvent,
  ): Promise<ResponseQualityCheckDto> {
    await this.requirementTaskService.updateTaskStatus({
      taskId: event.taskId,
      status: RequirementStatus.in_progress,
      progress: 0.5,
      details: {
        message: 'Code generated',
        generationModel: event.payload.modelToUse || 'default',
      },
    });

    const qualityResult = await this.qualityCheckService.checkCodeQuality(
      event.generatedCode,
      event.requirementAnalysis,
      event.language,
      event.taskId,
    );

    await this.requirementTaskService.updateTaskStatus({
      taskId: event.taskId,
      status: RequirementStatus.in_progress,
      progress: 0.7,
      details: {
        message: 'Code quality verified',
        qualityResult: {
          passed: qualityResult.passed,
          codeQualityScore: qualityResult.codeQualityScore,
          requirementCoverageScore: qualityResult.requirementCoverageScore,
          syntaxValidityScore: qualityResult.syntaxValidityScore,
          feedback: qualityResult.feedback,
        },
      },
    });

    return qualityResult;
  }

  async markTaskCompleted(
    event: CodeGeneratedEvent,
    qualityResult: ResponseQualityCheckDto,
  ): Promise<void> {
    const { payload } = event;
    this.logger.log(`Marking task ${event.taskId} as completed`);
    // 5. Commit code to Git
    const outputPath =
      payload.task.output_path ||
      this.determineOutputPath(
        payload.requirementAnalysis,
        payload.task.language,
      );
    const commitEvent = new CodeCommitdEvent({
      task: payload.task,
      qualityResult,
      generatedCode: payload.generatedCode,
      outputPath,
      requirementAnalysis: payload.requirementAnalysis,
    });
    this.eventEmitter.emit(commitEvent.eventName, commitEvent);
  }

  async markTaskFailed(event: CodeGeneratedEvent, error: Error): Promise<void> {
    await this.requirementTaskService.updateTaskStatus({
      taskId: event.taskId,
      status: RequirementStatus.failed,
      progress: 0,
      details: { error: error.message },
    });
  }

  private determineOutputPath(
    analysis: Record<string, any>,
    language: CodeLanguage,
  ): string {
    // Default paths based on language
    const defaultPaths = {
      typescript: 'src',
      javascript: 'src',
      python: 'src',
      java: 'src/main/java',
      go: 'pkg',
      rust: 'src',
      csharp: 'src',
      ruby: 'lib',
      php: 'src',
    };

    // Try to infer a meaningful path from the analysis
    if (analysis.fileStructure && analysis.fileStructure.length > 0) {
      // Look for common root directory in file structure
      const paths = analysis.fileStructure
        .map((file) => {
          if (typeof file === 'string') {
            const parts = file.split('/');
            return parts[0];
          }
          return null;
        })
        .filter(Boolean);

      if (paths.length > 0) {
        // Use most common directory
        const pathCounts = {};
        let maxCount = 0;
        let mostCommonPath = '';

        for (const p of paths) {
          pathCounts[p] = (pathCounts[p] || 0) + 1;
          if (pathCounts[p] > maxCount) {
            maxCount = pathCounts[p];
            mostCommonPath = p;
          }
        }

        if (mostCommonPath) {
          return mostCommonPath;
        }
      }
    }

    // Fallback to default path for the language
    const languageKey = language.toString().toLowerCase();
    return defaultPaths[languageKey] || 'src';
  }
}
