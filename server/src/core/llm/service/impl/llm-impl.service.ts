import { Injectable, Inject, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigType } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { LLMService } from '@server/core/llm/service/llm.service';
import { RequestLLMDto, RequestProviderLLMDto } from '@server/core/llm/dto/llm.dto';
import { dynamicLlmConfig, SingleLLMConfig, LLMProvider } from '@server/config/llm.config';

@Injectable()
export class LLmServiceImpl implements LLMService {
  private readonly logger = new Logger(LLmServiceImpl.name);

  constructor(
    private readonly httpService: HttpService,

    @Inject(dynamicLlmConfig.KEY)
    private readonly llmConfig: ConfigType<typeof dynamicLlmConfig>,
  ) {}

  public async callLLMApi(dto: RequestLLMDto): Promise<string> {
    const { prompt, systemMessage, options } = dto;
    const providerName = options?.provider || this.llmConfig.defaultProvider;
    const provider = this.getProvider(providerName);
    
    if (!provider) {
      throw new Error(`LLM provider '${provider.apiType}' not available`);
    }

    return this.callProviderApi({
      provider: provider.apiType,
      prompt,
      systemMessage,
      options
    });
  }

  public async callLLMApiWithFallback(dto: RequestLLMDto): Promise<{ content: string; provider: LLMProvider }> {
    const { prompt, systemMessage, options } = dto;
    const providerConfigs = this.getProvidersInFallbackOrder();
    const excludeProviders = options?.excludeProviders || [];
    
    let lastError: Error | null = null;

    for (const providerConfig of providerConfigs) {
      
      if (excludeProviders.includes(providerConfig.apiType)) {
        continue;
      }

      try {
        this.logger.debug(`Trying provider: ${providerConfig.apiType}`);
        const content = await this.callProviderApi({
          provider: providerConfig.apiType,
          prompt,
          systemMessage,
          options,
        });
        
        this.logger.log(`Successfully called provider: ${providerConfig.apiType}`);
        return { content, provider: providerConfig.apiType };
      } catch (error) {
        this.logger.warn(`Provider ${providerConfig.apiType} failed: ${error.message}`);
        lastError = error as Error;
        continue;
      }
    }

    throw new Error(`All LLM providers failed. Last error: ${lastError?.message}`);
  }

  private async callProviderApi(dto: RequestProviderLLMDto): Promise<string> {
    const { provider, prompt, systemMessage, options } = dto;
    try {
      // Select different call methods based on API type
      switch (provider) {
        case LLMProvider.ANTHROPIC:
          return this.callAnthropicApi(provider, prompt, systemMessage, options);
        case LLMProvider.GOOGLE:
          return this.callGoogleApi(provider, prompt, systemMessage, options);
        case LLMProvider.OLLAMA:
          return this.callOllamaNativeApi(provider, prompt, systemMessage, options);
        default:
          // OpenAI compatible API
          return this.callOpenAICompatibleApi(provider, prompt, systemMessage, options);
      }
    } catch (error) {
      this.logger.error(`Error calling ${provider} API: ${error.message}`);
      throw new Error(`Failed to call ${provider} API: ${error.message}`);
    }
  }

  /**
   * Call Ollama Native API (using /api/generate endpoint)
   * @private
   */
  private async callOllamaNativeApi(
    provider: LLMProvider,
    prompt: string,
    systemMessage?: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    // Build the complete prompt
    let fullPrompt = prompt;
    if (systemMessage) {
      fullPrompt = `${systemMessage}\n\n${prompt}`;
    }
    const providerConfig = this.getProvider(provider);
    const requestBody = {
      model: providerConfig.model,
      prompt: fullPrompt,
      stream: false, // Set to false to get the full response
      options: {
        temperature: options?.temperature ?? 0.2,
        num_predict: options?.maxTokens ?? -1, // -1 means no limit
      }
    };

    this.logger.debug(`Calling Ollama native API with model: ${providerConfig.model}`);

    const response = await lastValueFrom(
      this.httpService.post(
        `${providerConfig.apiUrl}/api/generate`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    );

    return response.data.response;
  }

  /**
   * Call OpenAI compatible API (keep original implementation)
   * @private
   */
  private async callOpenAICompatibleApi(
    provider: LLMProvider,
    prompt: string,
    systemMessage?: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    const messages = [];
    
    if (systemMessage) {
      messages.push({ role: 'system', content: systemMessage });
    } else {
      messages.push({ 
        role: 'system', 
        content: 'You are a helpful assistant specialized in software development.' 
      });
    }
    
    messages.push({ role: 'user', content: prompt });
    const providerConfig = this.getProvider(provider);
    const requestBody: any = {
      model: providerConfig.model,
      messages,
      temperature: options?.temperature ?? 0.2,
    };

    if (options?.maxTokens) {
      requestBody.max_tokens = options.maxTokens;
    }

    const headers: any = {
      'Content-Type': 'application/json',
    };

    if (providerConfig.apiKey !== 'ollama') {
      headers['Authorization'] = `Bearer ${providerConfig.apiKey}`;
    }

    const response = await lastValueFrom(
      this.httpService.post(
        `${providerConfig.apiUrl}/chat/completions`,
        requestBody,
        { headers }
      )
    );

    return response.data.choices[0].message.content;
  }

  // Anthropic and Google API remain unchanged
  private async callAnthropicApi(
    provider: LLMProvider,
    prompt: string,
    systemMessage?: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    const providerConfig = this.getProvider(provider);
    const requestBody: any = {
      model: providerConfig.model,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0.2,
      messages: [{ role: 'user', content: prompt }],
    };

    if (systemMessage) {
      requestBody.system = systemMessage;
    }

    const response = await lastValueFrom(
      this.httpService.post(
        `${providerConfig.apiUrl}/v1/messages`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': providerConfig.apiKey,
            'anthropic-version': '2023-06-01',
          },
        }
      )
    );

    return response.data.content[0].text;
  }

  private async callGoogleApi(
    provider: LLMProvider,
    prompt: string,
    systemMessage?: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    const fullPrompt = systemMessage ? `${systemMessage}\n\n${prompt}` : prompt;

    const requestBody = {
      contents: [{
        parts: [{ text: fullPrompt }]
      }],
      generationConfig: {
        temperature: options?.temperature ?? 0.2,
        maxOutputTokens: options?.maxTokens ?? 4096,
      }
    };
    const providerConfig = this.getProvider(provider);
    const response = await lastValueFrom(
      this.httpService.post(
        `${providerConfig.apiUrl}/models/${providerConfig.model}:generateContent?key=${providerConfig.apiKey}`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    );

    return response.data.candidates[0].content.parts[0].text;
  }

  public getAvailableProviders(): Record<string, SingleLLMConfig> {
    const availableProviders: Record<string, SingleLLMConfig> = {};
    
    Object.entries(this.llmConfig.providers).forEach(([name, config]) => {
      if (config.enabled !== false) {
        availableProviders[name] = config;
      }
    });
    
    return availableProviders;
  }

  private getProvider(providerName: LLMProvider): SingleLLMConfig | null {
    const provider = this.llmConfig.providers[providerName];
    if (!provider || provider.enabled === false) {
      return null;
    }
    return provider;
  }

  private getProvidersInFallbackOrder(): SingleLLMConfig[] {
    const providers: SingleLLMConfig[] = [];
    
    this.llmConfig.fallbackOrder.forEach(providerName => {
      const provider = this.getProvider(providerName);
      if (provider) {
        providers.push(provider);
      }
    });
    
    Object.entries(this.llmConfig.providers).forEach(([name, config]) => {
      if (config.enabled !== false && !this.llmConfig.fallbackOrder.includes(name as LLMProvider)) {
        providers.push(config);
      }
    });
    
    return providers;
  }
}