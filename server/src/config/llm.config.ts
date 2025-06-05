import { registerAs } from '@nestjs/config';

export type LLMConfig = {
  llmApiUrl: string;
  llmApiKey: string;
  llmApiModel: string; // Optional, can be used to specify a default model
};

export const llMConfig = registerAs<LLMConfig>('llm', () => ({
  llmApiUrl: process.env.LLM_API_URL,
  llmApiKey: process.env.LLM_API_KEY,
  llmApiModel: process.env.LLM_API_MODEL || 'gpt-4', // Optional model configuration
}));
