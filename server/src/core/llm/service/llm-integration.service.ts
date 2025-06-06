
import { RequestLLMDto, RequestLLMWithOllamaDto, AnalyzeLLMWithOllamaDto, RequestLLMWithOllamaKevinDto, OllamaAvailabilityResponseDto, OllamaModelTestDto } from '@server/core/llm/dto/llm.dto';

export interface LLMIntegrationService {
  callLLmApi(dto: RequestLLMDto): Promise<string>;
  generateCodeWithOllamaModel(dto: RequestLLMWithOllamaDto): Promise<Record<string, string>>;
  analyzeRequirementWithOllama(dto: AnalyzeLLMWithOllamaDto): Promise<Record<string, any>>;
  generateWithKevinModel(dto: RequestLLMWithOllamaKevinDto): Promise<string>;
  checkOllamaAvailability(): Promise<OllamaAvailabilityResponseDto>;
  testSpecificOllamaModel(dto: OllamaModelTestDto): Promise<boolean>;
}