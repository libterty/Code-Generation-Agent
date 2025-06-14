import { CodeLanguage, RequirementTask } from '.prisma/client';
import { EventBase } from '@server/core/event/base.event';
import { EventType } from '@server/core/event/event';
import { LLMProvider } from '@server/config/llm.config';

export type CodeGeneratedEventType = {
  modelToUse: LLMProvider;
  task: RequirementTask;
  generatedCode: Record<string, string>;
  requirementAnalysis: Record<string, any>;
};
export class CodeGeneratedEvent extends EventBase<CodeGeneratedEventType> {
  public readonly eventName = EventType.CODE_GENERATION;

  constructor(payload: CodeGeneratedEventType) {
    super(payload);
  }

  // Static factory method that validates before creating
  public create(payload: CodeGeneratedEventType): CodeGeneratedEvent {
    return new CodeGeneratedEvent(payload);
  }

  // Instance validation method for IEventValidator interface
  public validate(payload: CodeGeneratedEventType): boolean {
    return (
      !!payload?.task.id &&
      !!payload?.modelToUse &&
      typeof payload?.generatedCode === 'object' &&
      Object.keys(payload?.generatedCode).length > 0 &&
      typeof payload?.requirementAnalysis === 'object'
    );
  }

  // Event-specific getter methods for better encapsulation
  get taskId(): string {
    return this.payload.task.id;
  }

  get generatedCode(): Record<string, string> {
    return this.payload.generatedCode;
  }

  get requirementAnalysis(): Record<string, any> {
    return this.payload.requirementAnalysis;
  }

  get language(): CodeLanguage {
    return this.payload.task.language;
  }
}
