import { CodeLanguage } from '.prisma/client';
import { ResponseQualityCheckDto } from '../dto/quality-check.dto';

export interface QualityCheckService {
  checkCodeQuality(
    generatedCode: Record<string, string>,
    requirementAnalysis: Record<string, any>,
    language: CodeLanguage,
    taskId: string,
  ): Promise<ResponseQualityCheckDto>;
}
