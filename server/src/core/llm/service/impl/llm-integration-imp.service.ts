// src/core/llm/service/llm-integration.service.ts

import { Injectable, Logger, Inject } from '@nestjs/common';
import { CodeLanguage } from '.prisma/client';
import { LLMService } from '@server/core/llm/service/llm.service';
import { LLMIntegrationService } from '@server/core/llm/service/llm-integration.service';
import { RequestLLMDto, RequestLLMWithOllamaDto, AnalyzeLLMWithOllamaDto, RequestLLMWithOllamaKevinDto, OllamaAvailabilityResponseDto, OllamaModelTestDto } from '@server/core/llm/dto/llm.dto';
import { LLMProvider } from '@server/config/llm.config';
import { LLM_SERVICE } from '@server/constants';

@Injectable()
export class LlmIntegrationServiceImpl implements LLMIntegrationService {
  private readonly logger = new Logger(LlmIntegrationServiceImpl.name);

  constructor(
    @Inject(LLM_SERVICE)
    private readonly llmService: LLMService,
  ) {}

  /**
   * Call the LLM API with a prompt
   * @param dto Request DTO with prompt, systemMessage and options
   */
  public async callLLmApi(dto: RequestLLMDto): Promise<string> {
    try {
      dto.options.temperature = dto.options?.temperature ?? 0.2;
      
      if (dto.options?.useFallback !== false) {
        // Use fallback mechanism (will automatically try Ollama native API)
        const result = await this.llmService.callLLMApiWithFallback(dto);
        
        this.logger.log(`LLM call successful using provider: ${result.provider}`);
        return result.content;
      } else {
        // Use specified provider (now supports Ollama native API)
        return await this.llmService.callLLMApi(dto);
      }
    } catch (error) {
      this.logger.error(`Error calling LLM API: ${error.message}`);
      throw new Error(`Failed to call LLM API: ${error.message}`);
    }
  }

  /**
   * Generate code using the Ollama DeepSeek Coder model
   * @param requirementAnalysis Structured analysis of the requirement
   * @param language Target programming language
   */
  public async generateCodeWithOllamaModel(dto: RequestLLMWithOllamaDto): Promise<Record<string, string>> {
    const { requirementAnalysis, language, languageContext, systemMessage, provider, temperature, } = dto;
    const prompt = `
      Generate code in ${language.toLowerCase()} based on the following analyzed requirement:
      
      Title: ${requirementAnalysis.title}
      Functionality: ${requirementAnalysis.functionality}
      Components needed: ${this.formatList(requirementAnalysis.components)}
      
      ${languageContext}
      
      Provide complete code with proper documentation.
      Format the response as a JSON object where keys are file paths and values are the file content.
    `;

    // Explicitly use Ollama's DeepSeek Coder (native API)
    const result = await this.callLLmApi({
      prompt,
      systemMessage,
      options: {
        useFallback: false,
        provider,
        temperature,
      }
    });

    try {
      return JSON.parse(result);
    } catch (error) {
      return this.extractJsonFromText(result);
    }
  }

  /**
   * Generate code with multiple Ollama models for comparison
   * @param requirementAnalysis Structured analysis of the requirement
   * @param language Target programming language
   */
  public async generateCodeWithMultipleOllamaModels(dto: RequestLLMWithOllamaDto): Promise<Record<string, Record<string, string>>> {
    // Ensure these models are available in your environment
    const ollamaModels = [
      LLMProvider.OLLAMA_KEVIN, 
      LLMProvider.OLLAMA_DEEPSEEK_CODER, 
      LLMProvider.OLLAMA_DEEPSEEK_R1,
      LLMProvider.OLLAMA_LLAMA3_1, 
      LLMProvider.OLLAMA_QWEN2_5
    ];
    const results: Record<string, Record<string, string>> = {};

    for (const model of ollamaModels) {
      this.logger.debug(`Trying to generate code with ${model}`);
      const result = await this.generateCodeWithOllamaModel({
        ...dto,
        temperature: dto.temperature ?? 0.2,
        provider: model,
      });
      results[model] = result;
      this.logger.log(`Code generated successfully with ${model}`);
    }

    return results;
  }

  /**
   * Analyze requirements using the Ollama DeepSeek Chat model
   * @param requirementText The raw requirement text
   * @param language Target programming language
   */
  public async analyzeRequirementWithOllama(dto: AnalyzeLLMWithOllamaDto): Promise<Record<string, any>> {
    const { requirementContext, language, systemMessage } = dto;
    const prompt = `
      Analyze the following software requirement and break it down into structured components.
      The code will be implemented in ${language.toLowerCase()}.
      
      Requirement: ${requirementContext}
      
      Please provide:
      1. A clear title for this requirement
      2. The main functionality being requested
      3. Key components or modules needed
      4. Expected inputs and outputs
      5. Any dependencies or constraints mentioned
      6. Suggested file structure for implementation
    `;

    // Use Ollama's DeepSeek Chat for requirement analysis (native API)
    const result = await this.callLLmApi({
      prompt,
      systemMessage,
      options: {
        provider: LLMProvider.OLLAMA_DEEPSEEK_CHAT,
        temperature: 0.1,
        useFallback: false
      }
    });

    return this.parseAnalysisResult(result);
  }

  /**
   * Use the Kevin model for code generation
   * @param prompt The prompt for the Kevin model
   */
  public async generateWithKevinModel(dto: RequestLLMWithOllamaKevinDto): Promise<string> {
    return this.callLLmApi({
      prompt: dto.prompt,
      systemMessage: dto.systemMessage,
      options: {
        provider: LLMProvider.OLLAMA_KEVIN,
        temperature: 0.2,
        useFallback: false
      }
    });
  }

  /**
   * Check Ollama availability and list available models
   */
  public async checkOllamaAvailability(): Promise<OllamaAvailabilityResponseDto> {
    const availableProviders = this.llmService.getAvailableProviders();
    const ollamaProviders = Object.keys(availableProviders).filter(name => name.startsWith('ollama-'));
    
    return {
      available: ollamaProviders.length > 0,
      models: ollamaProviders as LLMProvider[],
    };
  }

  /**
   * Test if a specific Ollama model is available
   * @param modelName The name of the model to test
   */
  public async testSpecificOllamaModel(dto: OllamaModelTestDto): Promise<boolean> {
    const { modelName, systemMessage } = dto;
    try {
      const result = await this.callLLmApi({
        prompt: 'Hello, please respond with "OK" to confirm you are working.',
        systemMessage,
        options: {
          provider: `ollama-${modelName}` as LLMProvider,
          useFallback: false
        }
      });
      return result.toLowerCase().includes('ok');
    } catch (error) {
      this.logger.warn(`Model ollama-${modelName} is not available: ${error.message}`);
      return false;
    }
  }

  /**
   * Parse analysis result from LLM response
   * @param result LLM response text
   * @private
   */
  private parseAnalysisResult(result: string): Record<string, any> {
    return {
      title: this.extractTitle(result),
      functionality: this.extractSection(result, 'main functionality'),
      components: this.extractComponents(result),
      inputsOutputs: this.extractSection(result, 'inputs and outputs'),
      dependencies: this.extractSection(result, 'dependencies or constraints'),
      fileStructure: this.extractFileStructure(result)
    };
  }

  /**
   * Extract a title from LLM response
   * @param text LLM response text
   * @private
   */
  private extractTitle(text: string): string {
    const titleRegex = /(?:title|name):\s*(.*?)(?:\n|$)/i;
    const match = text.match(titleRegex);
    return match ? match[1].trim() : 'Untitled Requirement';
  }

  /**
   * Extract a specific section from LLM response
   * @param text LLM response text
   * @param section Section name to extract
   * @private
   */
  private extractSection(text: string, section: string): string {
    const sectionRegex = new RegExp(`(?:${section}|\\d+\\.\\s*(?:[\\w\\s]+${section}[\\w\\s]+)):?\\s*([\\s\\S]*?)(?:\\n\\s*\\d+\\.|\\n\\s*(?:[A-Z]|\\w+:)|$)`, 'i');
    const match = text.match(sectionRegex);
    return match ? match[1].trim() : '';
  }

  /**
   * Extract components from LLM response
   * @param text LLM response text
   * @private
   */
  private extractComponents(text: string): string[] {
    // Try to find components section
    const componentsSection = this.extractSection(text, 'components|modules');
    
    if (!componentsSection) {
      return [];
    }
    
    // Split by bullet points or numbered items
    const componentLines = componentsSection.split(/\n\s*[-*•]|\n\s*\d+\.\s+/).filter(Boolean);
    
    return componentLines.map(line => line.trim());
  }

  /**
   * Extract file structure from LLM response
   * @param text LLM response text
   * @private
   */
  private extractFileStructure(text: string): string[] {
    const fileStructureSection = this.extractSection(text, 'file structure');
    
    if (!fileStructureSection) {
      return [];
    }
    
    // Split by bullet points, numbered items, or file paths
    const fileLines = fileStructureSection.split(/\n\s*[-*•]|\n\s*\d+\.\s+|\n\s*(?:\/|\\)/).filter(Boolean);
    
    return fileLines.map(line => {
      // Clean up file paths
      const cleaned = line.trim().replace(/^(?:\/|\\|-\s*|•\s*|\d+\.\s*)/, '');
      return cleaned;
    });
  }

  /**
   * Format a list of items for prompting
   * @param items List of items
   * @private
   */
  private formatList(items: string[]): string {
    if (!items || items.length === 0) {
      return 'None specified';
    }
    
    return items.map(item => `- ${item}`).join('\n');
  }

  /**
   * Extract JSON from text response when direct parsing fails
   * @param text LLM response text
   * @private
   */
  private extractJsonFromText(text: string): Record<string, string> {
    // Try to find JSON block in the text
    const jsonBlockRegex = /```(?:json)?\s*({[\s\S]*?})\s*```|({[\s\S]*?})/;
    const match = text.match(jsonBlockRegex);
    
    if (match && (match[1] || match[2])) {
      try {
        return JSON.parse(match[1] || match[2]);
      } catch (error) {
        this.logger.error('Failed to parse JSON from extracted block', error);
      }
    }
    
    // Fallback: try to construct JSON from file sections
    const fileBlockRegex = /```(?:\w+)?\s*\/([^/]+\/[^`]+)```/g;
    const fileBlocks = [...text.matchAll(fileBlockRegex)];
    
    const result: Record<string, string> = {};
    
    for (const match of fileBlocks) {
      const parts = match[1].split('\n');
      if (parts.length > 0) {
        const filePath = parts[0].trim();
        const content = parts.slice(1).join('\n');
        result[filePath] = content;
      }
    }
    
    if (Object.keys(result).length > 0) {
      return result;
    }
    
    // Last resort: extract filename/path headers and code blocks
    const headers = text.match(/#{1,3}\s+([^#\n]+\.[\w]+)/g) || [];
    const codeBlocks = text.match(/```(?:\w+)?\s*([\s\S]*?)```/g) || [];
    
    if (headers.length > 0 && headers.length === codeBlocks.length) {
      for (let i = 0; i < headers.length; i++) {
        const filePath = headers[i].replace(/^#{1,3}\s+/, '').trim();
        const content = codeBlocks[i].replace(/```(?:\w+)?\s*([\s\S]*?)```/, '$1').trim();
        result[filePath] = content;
      }
    }
    
    return result;
  }
}