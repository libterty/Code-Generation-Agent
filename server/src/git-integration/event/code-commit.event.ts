import { CodeLanguage } from '.prisma/client';
import { EventBase } from '@server/core/event/base.event';
import { EventType } from '../../core/event/event';
import { RequestCommitGitDto } from '@server/git-integration/dto/commit-git.dto';

export class CodeCommitdEvent extends EventBase<RequestCommitGitDto> {
  public readonly eventName = EventType.CODE_COMMIT;

  constructor(payload: RequestCommitGitDto) {
    super(payload);
  }

  // Static factory method that validates before creating
  public create(payload: RequestCommitGitDto): CodeCommitdEvent {
    return new CodeCommitdEvent(payload);
  }

  // Instance validation method for IEventValidator interface
  public validate(payload: RequestCommitGitDto): boolean {
    return (
      !!payload?.task &&
      typeof payload?.task.id === 'string' &&
      !!payload?.task.language &&
      typeof payload?.task.language === 'string' &&
      typeof payload?.qualityResult === 'object' &&
      !!payload?.outputPath &&
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
