
export class CodeCommittedEvent {
  static eventName = 'code-commit';
  
  constructor(
    public readonly taskId: string,
    public readonly commitHash: string,
    public readonly repository: string,
    public readonly branch: string,
    public readonly filesChanged: string[]
  ) {}
}