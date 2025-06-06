import { Logger } from '@nestjs/common';
import { IEvent } from './base.event';

// Generic EventListener interface - Single Responsibility
export interface EventListener<TEvent extends IEvent> {
  handle(event: TEvent): Promise<void>;
}

// Enhanced EventListener with error handling - following Open/Closed Principle
export interface EnhancedEventListener<TEvent extends IEvent>
  extends EventListener<TEvent> {
  canHandle(event: IEvent): boolean;
  onError(error: Error, event: TEvent): Promise<void>;
}

// Event processing strategy interface - Strategy Pattern
export interface EventProcessorStrategy<TEvent extends IEvent, K = any> {
  processEvent(event: TEvent): Promise<K>;
  markTaskCompleted(event: TEvent, ...args: any): Promise<void>;
  markTaskFailed(event: TEvent, error: Error, ...args: any): Promise<void>;
}

// Concrete strategies for code generation
export interface ICodeStorageStrategy {
  saveCode(taskId: string, code: Record<string, string>): Promise<void>;
}

export interface INotificationStrategy {
  notifyCompletion(taskId: string): Promise<void>;
}

export interface IAnalyticsStrategy<TEvent extends IEvent> {
  trackCodeGeneration(event: IEvent<TEvent>): Promise<void>;
}

// Abstract base event listener - Template Method Pattern
export abstract class BaseEventListener<TEvent extends IEvent>
  implements EnhancedEventListener<TEvent>
{
  protected abstract readonly logger: Logger;
  protected abstract readonly eventName: string;

  public canHandle(event: IEvent): boolean {
    return event.eventName === this.eventName;
  }

  public async handle(event: TEvent): Promise<void> {
    try {
      this.logger.verbose(
        `Processing event: ${event.eventName} (${event.eventId})`,
      );

      await this.validateEvent(event);
      await this.processEvent(event);
      await this.postProcess(event);

      this.logger.verbose(
        `Successfully processed event: ${event.eventName} (${event.eventId})`,
      );
    } catch (error) {
      await this.onError(error as Error, event);
      throw error;
    }
  }

  public async onError(error: Error, event: TEvent): Promise<void> {
    this.logger.error(
      `Failed to process event: ${event.eventName} (${event.eventId})`,
      error.stack,
    );
  }

  // Template methods - to be implemented by concrete classes
  protected abstract processEvent(event: TEvent): Promise<void>;

  // Optional hooks with default implementations
  protected async validateEvent(event: TEvent): Promise<void> {
    // Override if custom validation is needed
  }

  protected async postProcess(event: TEvent): Promise<void> {
    // Override if post-processing is needed
  }
}
