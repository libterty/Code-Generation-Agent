
import { RequestLLMDto } from '@server/core/llm/dto/llm.dto';
import { LLMProvider, SingleLLMConfig } from '@server/config/llm.config';

export interface LLMService {
  callLLMApi(dto: RequestLLMDto): Promise<string>;
  callLLMApiWithFallback(dto: RequestLLMDto): Promise<{ content: string; provider: LLMProvider }>;
  getAvailableProviders(): Record<string, SingleLLMConfig>;
}