export class ResponseQualityCheckDto {
  passed: boolean;
  codeQualityScore: number;
  requirementCoverageScore: number;
  syntaxValidityScore: number;
  feedback: string;
}
