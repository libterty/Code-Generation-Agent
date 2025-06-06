import { Injectable, Inject, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EventType } from '@server/core/event/event';
import { IEvent } from '@server/core/event/base.event';
import {
  BaseEventListener,
  EventListener,
  EventProcessorStrategy,
} from '@server/core/event/event.listener';
import { CodeGenerationService } from '@server/code-generation/service/code-generation.service';
import { CodeGeneratedEvent } from '@server/code-generation/event/code-generate.event';
import { ResponseQualityCheckDto } from '@server/quality-check/dto/quality-check.dto';
import {
  CODE_GENERATION_SERVICE,
  CODE_GENERATION_PROCESSOR,
} from '@server/constants';

@Injectable()
export class CodeGenerateEventListener extends BaseEventListener<CodeGeneratedEvent> {
  protected readonly logger = new Logger(CodeGenerateEventListener.name);
  protected readonly eventName = EventType.CODE_GENERATION;

  constructor(
    @Inject(CODE_GENERATION_PROCESSOR)
    private readonly processor: EventProcessorStrategy<
      CodeGeneratedEvent,
      ResponseQualityCheckDto
    >,
  ) {
    super();
  }

  @OnEvent(EventType.CODE_GENERATION, { async: true })
  public async handle(event: CodeGeneratedEvent): Promise<void> {
    return super.handle(event);
  }

  // Override canHandle for more specific logic if needed
  public canHandle(event: IEvent): boolean {
    return super.canHandle(event) && event instanceof CodeGeneratedEvent;
  }

  protected async validateEvent(event: CodeGeneratedEvent): Promise<void> {
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
  }

  protected async processEvent(event: CodeGeneratedEvent): Promise<void> {
    this.logger.debug(`Processing code generation for task: ${event.taskId}`);

    // Use the processor strategy for main processing
    const qualityCheckResult = await this.processor.processEvent(event);

    // Additional service-specific logic
    if (qualityCheckResult.codeQualityScore > 80) {
      this.logger.log(
        `High code quality score for task ${event.taskId}: ${qualityCheckResult.codeQualityScore}`,
      );
      await this.handleCodeGenerationCompletion(event, qualityCheckResult);
    } else {
      this.logger.warn(
        `Low code quality score for task ${event.taskId}: ${qualityCheckResult.codeQualityScore}`,
      );
      await this.onError(new Error('Low code quality score'), event);
    }
  }

  protected async postProcess(event: CodeGeneratedEvent): Promise<void> {
    // Post-processing logic
    this.logger.debug(`Post-processing completed for task: ${event.taskId}`);

    // Example: Clean up temporary resources, update metrics, etc.
    await this.updateMetrics(event);
  }

  private async handleCodeGenerationCompletion(
    event: CodeGeneratedEvent,
    qualityResult: ResponseQualityCheckDto,
  ): Promise<void> {
    try {
      // Update task status in the service
      await this.processor.markTaskCompleted(event, qualityResult);
      this.logger.log(`Task ${event.taskId} marked as completed`);
    } catch (error) {
      this.logger.warn(
        `Failed to mark task ${event.taskId} as completed`,
        error,
      );
      // Don't throw - this is not critical for the main flow
    }
  }

  private async updateMetrics(event: CodeGeneratedEvent): Promise<void> {
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

  public async onError(error: Error, event: CodeGeneratedEvent): Promise<void> {
    await super.onError(error, event);

    // Specific error handling for code generation
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
    event: CodeGeneratedEvent,
    error: Error,
  ): Promise<void> {
    try {
      // Example: Send error notification to monitoring system
      this.logger.error(`Code generation failed for task: ${event.taskId}`, {
        taskId: event.taskId,
        language: event.language,
        error: error.message,
        timestamp: event.timestamp,
      });

      // maybe will sse later use a notification service
    } catch (notificationError) {
      this.logger.error('Failed to send error notification', notificationError);
    }
  }
}
