import { CodeLanguage } from '.prisma/client';

export class AnalyzeRequirementDto {
  requirementText: string;
  language: CodeLanguage;
  templateId?: string;
}
