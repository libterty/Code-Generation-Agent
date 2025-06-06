import { Injectable, Inject, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventType } from '@server/core/event/event';
import { IEvent } from '@server/core/event/base.event';
import {
  BaseEventListener,
  EventProcessorStrategy,
} from '@server/core/event/event.listener';
import { CodeCommitdEvent } from '@server/git-integration/event/code-commit.event';
import { ResponseCommitGitDto } from '@server/git-integration/dto/commit-git.dto';
import { CODE_COMMIT_PROCESSOR } from '@server/constants';

@Injectable()
export class CodeCommitEventListener extends BaseEventListener<CodeCommitdEvent> {
  protected readonly logger = new Logger(CodeCommitEventListener.name);
  protected readonly eventName = EventType.CODE_COMMIT;

  constructor(
    @Inject(CODE_COMMIT_PROCESSOR)
    private readonly processor: EventProcessorStrategy<
      CodeCommitdEvent,
      ResponseCommitGitDto
    >,
  ) {
    super();
  }

  @OnEvent(EventType.CODE_COMMIT, { async: true })
  public async handle(event: CodeCommitdEvent): Promise<void> {
    return super.handle(event);
  }

  // Override canHandle for more specific logic if needed
  public canHandle(event: IEvent): boolean {
    return super.canHandle(event) && event instanceof CodeCommitdEvent;
  }

  protected async validateEvent(event: CodeCommitdEvent): Promise<void> {
    if (!event.validate(event.payload)) {
      throw new Error(`Invalid event payload for ${event.eventName}`);
    }

    // Additional business validation
    if (!event.taskId || event.taskId.trim().length === 0) {
      throw new Error('Task ID cannot be empty');
    }

    if (!event.generatedCode || Object.keys(event.generatedCode).length === 0) {
      throw new Error('Generated code cannot be empty');
    }

    // Validate required Git parameters
    if (!event.payload.task.repository_url || !event.payload.task.branch) {
      throw new Error('Repository URL and branch must be provided');
    }
  }

  protected async processEvent(event: CodeCommitdEvent): Promise<void> {
    this.logger.debug(`Processing code commit for task: ${event.taskId}`);

    // Use the processor strategy for main processing
    const commitResult = await this.processor.processEvent(event);

    // Handle successful commit
    if (commitResult && commitResult.commitHash) {
      this.logger.log(
        `Successfully committed code for task ${event.taskId}, commit hash: ${commitResult.commitHash}`,
      );
      await this.handleCommitCompletion(event, commitResult);
    } else {
      this.logger.warn(`No commit hash returned for task ${event.taskId}`);
      await this.onError(new Error('Failed to get commit hash'), event);
    }
  }

  protected async postProcess(event: CodeCommitdEvent): Promise<void> {
    // Post-processing logic
    this.logger.debug(`Post-processing completed for task: ${event.taskId}`);

    // Example: Clean up temporary resources, update metrics, etc.
    await this.updateMetrics(event);
  }

  private async handleCommitCompletion(
    event: CodeCommitdEvent,
    commitResult: ResponseCommitGitDto,
  ): Promise<void> {
    try {
      await this.processor.markTaskCompleted(event, commitResult);
      this.logger.log(`Task ${event.taskId} marked as completed`);
    } catch (error) {
      this.logger.warn(
        `Failed to mark task ${event.taskId} as completed`,
        error,
      );
      // Don't throw - this is not critical for the main flow
    }
  }

  private async updateMetrics(event: CodeCommitdEvent): Promise<void> {
    try {
      // Update processing metrics
      const processingTime = Date.now() - event.timestamp.getTime();
      this.logger.debug(
        `Event processed in ${processingTime}ms for task: ${event.taskId}`,
      );
    } catch (error) {
      this.logger.warn('Failed to update metrics', error);
    }
  }

  public async onError(error: Error, event: CodeCommitdEvent): Promise<void> {
    await super.onError(error, event);

    // Specific error handling for code commit
    try {
      await this.processor.markTaskFailed(event, error);
      this.logger.error(
        `Task ${event.taskId} marked as failed due to: ${error.message}`,
      );
    } catch (serviceError) {
      this.logger.error(
        'Failed to mark task as failed in service',
        serviceError,
      );
    }

    // Additional error handling: notify relevant stakeholders, update error metrics, etc.
    await this.handleErrorNotification(event, error);
  }

  private async handleErrorNotification(
    event: CodeCommitdEvent,
    error: Error,
  ): Promise<void> {
    try {
      // Example: Send error notification to monitoring system
      this.logger.error(`Code commit failed for task: ${event.taskId}`, {
        taskId: event.taskId,
        repositoryUrl: event.payload.task.repository_url,
        branch: event.payload.task.branch,
        error: error.message,
        timestamp: event.timestamp,
      });

      // maybe will use a notification service later
    } catch (notificationError) {
      this.logger.error('Failed to send error notification', notificationError);
    }
  }
}
