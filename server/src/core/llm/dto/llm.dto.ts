
import { CodeLanguage } from '.prisma/client';
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

export class RequestLLMWithOllamaDto {
  systemMessage: string;
  requirementAnalysis: Record<string, any>;
  language: CodeLanguage;
  languageContext: string;
  provider?: LLMProvider;
  temperature?: number; // double
}

export class AnalyzeLLMWithOllamaDto {
  systemMessage: string;
  requirementContext: string;
  language: CodeLanguage;
}

export class RequestLLMWithOllamaKevinDto {
  systemMessage: string;
  prompt: string;
}

export class OllamaAvailabilityResponseDto {
  available: boolean;
  models: LLMProvider[];
}

export class OllamaModelTestDto {
  systemMessage: string;
  modelName: string;
}