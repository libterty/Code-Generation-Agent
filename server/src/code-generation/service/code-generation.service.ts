import { LLMProvider } from '@server/config/llm.config';

export interface CodeGenerationService {
  processRequirement(taskId: string): Promise<void>;
  processRequirementWithSpecificModel(
    taskId: string,
    modelName?: LLMProvider,
  ): Promise<void>;
  processRequirementWithModelComparison(taskId: string): Promise<void>;
}
