// config/llm.config.ts - 修復版本
import { registerAs } from '@nestjs/config';

export enum LLMProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  DEEPSEEK = 'deepseek',
  QWEN = 'qwen',
  OLLAMA_LLAMA2 = 'ollama-llama2', 
  OLLAMA_LLAMA3 = 'ollama-llama3', 
  OLLAMA_LLAMA3_1 = 'ollama-llama3.1', 
  OLLAMA_LLAMA3_2 = 'ollama-llama3.2', 
  OLLAMA_DEEPSEEK_CODER = 'ollama-deepseek-coder',
  OLLAMA_DEEPSEEK_CHAT = 'ollama-deepseek-chat',
  OLLAMA_DEEPSEEK_R1 = 'ollama-deepseek-r1',
  OLLAMA_QWEN = 'ollama-qwen',
  OLLAMA_QWEN2 = 'ollama-qwen2',
  OLLAMA_QWEN2_5 = 'ollama-qwen2.5',
  OLLAMA_PHI = 'ollama-phi',
  OLLAMA_PHI3 = 'ollama-phi3',
  OLLAMA_MISTRAL = 'ollama-mistral',
  OLLAMA_MIXTRAL = 'ollama-mixtral',
  OLLAMA_CODELLAMA = 'ollama-codellama',
  OLLAMA_VICUNA = 'ollama-vicuna',
  OLLAMA_OPENCHAT = 'ollama-openchat',
  OLLAMA_QWQ = 'ollama-qwq',
  OLLAMA_MINICPM_V = 'ollama-minicpm-v',
  OLLAMA_KEVIN = 'ollama-kevin',
  OLLAMA = 'ollama',
}

export type SingleLLMConfig = {
  apiUrl: string;
  apiKey: string;
  model: string;
  enabled?: boolean;
  apiType: LLMProvider;
};

export type DynamicLLMConfig = {
  providers: Record<string, SingleLLMConfig>;
  defaultProvider: LLMProvider;
  fallbackOrder: LLMProvider[];
};

export const dynamicLlmConfig = registerAs<DynamicLLMConfig>('dynamicLlm', () => {
  const config: Record<string, SingleLLMConfig> = {};
  const providerNames = [LLMProvider.OPENAI, LLMProvider.ANTHROPIC, LLMProvider.GOOGLE, LLMProvider.DEEPSEEK, LLMProvider.QWEN];
  
  // 處理一般提供商
  providerNames.forEach(provider => {
    const upperProvider = provider.toUpperCase();
    const apiKey = process.env[`${upperProvider}_API_KEY`];
    
    if (apiKey) {
      config[provider] = {
        apiUrl: process.env[`${upperProvider}_API_URL`] || getDefaultUrl(provider),
        apiKey,
        model: process.env[`${upperProvider}_MODEL`] || getDefaultModel(provider),
        enabled: process.env[`${upperProvider}_ENABLED`] !== 'false',
        apiType: provider,
      };
    }
  });

  // 處理 Ollama 的原生 API
  const ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434'; // 移除 /v1
  const ollamaEnabled = process.env.OLLAMA_ENABLED !== 'false';
  
  if (ollamaEnabled) {
    const ollamaModels = [
      'llama2', 'llama3', 'llama3.1', 'llama3.2',
      'deepseek-coder', 'deepseek-chat', 'deepseek-r1',
      'qwen', 'qwen2', 'qwen2.5',
      'phi', 'phi3', 'mistral', 'mixtral',
      'codellama', 'vicuna', 'openchat', 
      'qwq', 'minicpm-v',
      'kevin'
    ];

    const enabledOllamaModels = process.env.OLLAMA_MODELS 
      ? process.env.OLLAMA_MODELS.split(',').map(m => m.trim())
      : ['llama3.1'];

    enabledOllamaModels.forEach(model => {
      if (ollamaModels.includes(model)) {
        config[`ollama-${model}`] = {
          apiUrl: ollamaUrl, // 使用原生 URL
          apiKey: 'ollama',
          model: model,
          enabled: true,
          apiType: LLMProvider.OLLAMA
        };
      }
    });
  }

  return {
    providers: config,
    defaultProvider: process.env.DEFAULT_LLM_PROVIDER as LLMProvider || Object.keys(config)[0] as LLMProvider || LLMProvider.OPENAI as LLMProvider,
    fallbackOrder: (process.env.LLM_FALLBACK_ORDER || '').split(',').filter(Boolean) as LLMProvider[],
  };
});

function getDefaultUrl(provider: string): string {
  const urls: Record<string, string> = {
    openai: 'https://api.openai.com/v1',
    anthropic: 'https://api.anthropic.com',
    google: 'https://generativelanguage.googleapis.com/v1',
    deepseek: 'https://api.deepseek.com/v1',
    qwen: 'https://dashscope.aliyuncs.com/api/v1',
    'ollama-llama2': 'http://localhost:11434',
    'ollama-llama3': 'http://localhost:11434',
    'ollama-llama3.1': 'http://localhost:11434',
    'ollama-llama3.2': 'http://localhost:11434',
    'ollama-deepseek-coder': 'http://localhost:11434',
    'ollama-deepseek-chat': 'http://localhost:11434',
    'ollama-deepseek-r1': 'http://localhost:11434',
    'ollama-qwen': 'http://localhost:11434',
    'ollama-qwen2': 'http://localhost:11434',
    'ollama-qwen2.5': 'http://localhost:11434',
    'ollama-phi': 'http://localhost:11434',
    'ollama-phi3': 'http://localhost:11434',
    'ollama-mistral': 'http://localhost:11434',
    'ollama-mixtral': 'http://localhost:11434',
    'ollama-codellama': 'http://localhost:11434',
    'ollama-vicuna': 'http://localhost:11434',
    'ollama-openchat': 'http://localhost:11434',
    'ollama-qwq': 'http://localhost:11434',
    'ollama-minicpm-v': 'http://localhost:11434',
    'ollama-kevin': 'http://localhost:11434',
    ollama: 'http://localhost:11434',
  };
  return urls[provider] || '';
}

function getDefaultModel(provider: string): string {
  const models: Record<string, string> = {
    openai: 'gpt-4',
    anthropic: 'claude-3.7',
    google: 'gemini-pro',
    deepseek: 'deepseek-chat',
    qwen: 'qwen-turbo',
  };
  return models[provider] || '';
}
