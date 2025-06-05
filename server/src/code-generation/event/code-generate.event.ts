export class CodeGeneratedEvent {
  static eventName = 'code-generate';

  constructor(
    public readonly taskId: string,
    public readonly generatedCode: Record<string, string>,
    public readonly requirementAnalysis: Record<string, any>,
    public readonly language: string
  ) {}
}