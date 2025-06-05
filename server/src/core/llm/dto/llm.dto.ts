import { LLMProvider } from '@server/config/llm.config';

export class RequestLLMDto {
  prompt: string;
  systemMessage?: string;
  options?: {
    useFallback?: boolean;
    temperature?: number;
    maxTokens?: number;
    provider?: LLMProvider;
    excludeProviders?: LLMProvider[];
  };
}

export class RequestProviderLLMDto extends RequestLLMDto {
  provider: LLMProvider;
}
