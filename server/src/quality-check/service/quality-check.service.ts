
import { CodeLanguage } from '.prisma/client';

export interface QualityCheckService {
  checkCodeQuality(
    generatedCode: Record<string, string>,
    requirementAnalysis: Record<string, any>,
    language: CodeLanguage,
    taskId: string
  )
}