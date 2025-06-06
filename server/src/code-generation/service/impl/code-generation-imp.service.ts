// src/code-generation/services/code-generation.service.ts

import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaClient, CodeLanguage, RequirementStatus } from '.prisma/client';
import { LLMProvider } from '@server/config/llm.config';
import { CodeGenerationService } from '@server/code-generation/service/code-generation.service';
import { LLMIntegrationService } from '@server/core/llm/service/llm-integration.service';
import { RequirementTaskService } from '@server/requirement-task/service/requirement-task.service';
import { GitIntegrationService } from '@server/git-integration/service/git-integration.service';
import { QualityCheckService } from '@server/quality-check/service/quality-check.service';
import {
  PRISMA_REPOSITORY,
  REQUIREMENT_TASK_SERVICE,
  LLM_INTEGRATION_SERVICE,
  GIT_INTEGRATION_SERVICE,
  QUALITY_CHECK_SERVICE,
} from '@server/constants';
import { CodeGeneratedEvent } from '@server/code-generation/event/code-generate.event';
import { EventType } from '@server/core/event/event';

/**
 * CodeGenerationServiceImpl
 *
 * This service handles requirement analysis and code generation using various LLMs,
 * especially Ollama models. It supports model selection, code quality checks, and
 * Git integration for generated code.
 *
 * Guide for using Ollama models:
 * - Always check Ollama availability before using any model.
 * - Use DeepSeek Chat for requirement analysis.
 * - Use Kevin or DeepSeek Coder for code generation.
 * - Compare outputs from multiple models for important tasks.
 * - Always verify code quality.
 */
@Injectable()
export class CodeGenerationServiceImpl
  implements OnModuleInit, CodeGenerationService
{
  private readonly logger = new Logger(CodeGenerationServiceImpl.name);
  // System message for LLM context
  private readonly systemMessage =
    'You are a helpful assistant specialized in software development.';

  constructor(
    private readonly eventEmitter: EventEmitter2,

    @Inject(PRISMA_REPOSITORY)
    private prismaRepository: PrismaClient,

    @Inject(REQUIREMENT_TASK_SERVICE)
    private readonly requirementTaskService: RequirementTaskService,

    @Inject(GIT_INTEGRATION_SERVICE)
    private readonly gitIntegrationService: GitIntegrationService,

    @Inject(LLM_INTEGRATION_SERVICE)
    private readonly llmIntegrationService: LLMIntegrationService,

    @Inject(QUALITY_CHECK_SERVICE)
    private readonly qualityCheckService: QualityCheckService,
  ) {}

  /**
   * Service initialization
   */
  public async onModuleInit() {
    this.logger.log('Code Generation Service initialized');
  }

  /**
   * Process a requirement task.
   * This method is triggered when a requirement task is ready.
   *
   * Steps:
   * 1. Analyze requirement (prefer Ollama DeepSeek Chat if available)
   * 2. Generate code (prefer Kevin or DeepSeek Coder if available)
   * 3. Check code quality
   * 4. Commit code to Git
   *
   * @param taskId Task ID to process
   */
  public async processRequirement(taskId: string): Promise<void> {
    try {
      // Fetch task details from DB
      const task = await this.prismaRepository.requirementTask.findUnique({
        where: { id: taskId },
      });

      if (!task) {
        throw new Error(`Task with ID ${taskId} not found`);
      }

      // Update status: starting analysis
      await this.requirementTaskService.updateTaskStatus({
        taskId,
        status: RequirementStatus.in_progress,
        progress: 0.1,
        details: { message: 'Starting requirement analysis' },
      });

      // 1. Check Ollama availability
      const ollamaStatus =
        await this.llmIntegrationService.checkOllamaAvailability();
      const useOllama = ollamaStatus.available;

      this.logger.log(
        `Ollama availability: ${
          useOllama ? 'Available' : 'Unavailable'
        }, Models: ${ollamaStatus.models.join(', ')}`,
      );

      // 2. Requirement analysis (prefer DeepSeek Chat)
      let requirementAnalysis;
      if (useOllama) {
        requirementAnalysis =
          await this.llmIntegrationService.analyzeRequirementWithOllama({
            requirementContext: task.requirement_text,
            language: task.language,
            systemMessage: this.systemMessage,
          });
      } else {
        requirementAnalysis = await this.analyzeRequirement(
          task.requirement_text,
          task.language,
        );
      }

      await this.requirementTaskService.updateTaskStatus({
        taskId,
        status: RequirementStatus.in_progress,
        progress: 0.3,
        details: {
          message: 'Requirement analyzed',
          analysis: requirementAnalysis,
        },
      });

      // 3. Code generation (prefer Kevin, fallback to DeepSeek Coder)
      let generatedCode;
      let modelToUse = LLMProvider.OPENAI; // Declare and assign modelToUse
      if (useOllama) {
        const kevinAvailable =
          await this.llmIntegrationService.testSpecificOllamaModel({
            modelName: LLMProvider.OLLAMA_KEVIN,
            systemMessage: this.systemMessage,
          });

        if (kevinAvailable) {
          this.logger.log('Using Kevin model for code generation');
          const kevinResponse =
            await this.llmIntegrationService.generateWithKevinModel({
              prompt:
                `Generate code in ${task.language.toLowerCase()} for: ${
                  requirementAnalysis.title
                }\n` +
                `Functionality: ${requirementAnalysis.functionality}\n` +
                `Components: ${this.formatList(
                  requirementAnalysis.components,
                )}`,
              systemMessage: this.systemMessage,
            });
          generatedCode = this.extractJsonFromText(kevinResponse);
          modelToUse = LLMProvider.OLLAMA_KEVIN;
        } else {
          generatedCode =
            await this.llmIntegrationService.generateCodeWithOllamaModel({
              requirementAnalysis,
              language: task.language,
              languageContext: this.getLanguageContext(task.language),
              systemMessage: this.systemMessage,
              provider: LLMProvider.OLLAMA_DEEPSEEK_CODER,
              temperature: 0.2,
            });
          modelToUse = LLMProvider.OLLAMA_DEEPSEEK_CODER;
        }
      } else {
        generatedCode = await this.generateCode(
          requirementAnalysis,
          task.language,
        );
      }

      const codeGeneratedEvent = new CodeGeneratedEvent({
        modelToUse,
        task,
        generatedCode,
        requirementAnalysis,
      });
      this.eventEmitter.emit(EventType.CODE_GENERATION, codeGeneratedEvent);
    } catch (error) {
      this.logger.error(
        `Error processing task ${taskId}: ${error.message}`,
        error.stack,
      );
      await this.requirementTaskService.updateTaskStatus({
        taskId,
        status: RequirementStatus.failed,
        progress: 0,
        details: { error: error.message },
      });
    }
  }

  /**
   * Process a requirement task with a specific Ollama model.
   *
   * @param taskId Task ID to process
   * @param modelName Optional model name (e.g., 'kevin', 'deepseek-coder')
   */
  public async processRequirementWithSpecificModel(
    taskId: string,
    requestedModel: LLMProvider = LLMProvider.OPENAI,
  ): Promise<void> {
    try {
      // Fetch task details
      const task = await this.prismaRepository.requirementTask.findUnique({
        where: { id: taskId },
      });

      if (!task) {
        throw new Error(`Task with ID ${taskId} not found`);
      }

      // Update status: starting analysis
      await this.requirementTaskService.updateTaskStatus({
        taskId,
        status: RequirementStatus.in_progress,
        progress: 0.1,
        details: {
          message: 'Starting requirement analysis',
          requestedModel,
        },
      });

      if (requestedModel.includes('ollama')) {
        // Check if requested model is available
        const isAvailable =
          await this.llmIntegrationService.testSpecificOllamaModel({
            modelName: requestedModel,
            systemMessage: this.systemMessage,
          });

        if (!isAvailable) {
          throw new Error(
            `Requested ollama model ${requestedModel} is not available, checking alternatives`,
          );
        }
      }

      // Requirement analysis
      let requirementAnalysis;

      if (requestedModel.includes('ollama')) {
        switch (requestedModel) {
          case LLMProvider.OLLAMA_DEEPSEEK_CHAT:
            requirementAnalysis =
              await this.llmIntegrationService.analyzeRequirementWithOllama({
                requirementContext: task.requirement_text,
                language: task.language,
                systemMessage: this.systemMessage,
              });
            break;
          default:
            const analysisPrompt = `
            Analyze the following software requirement and break it down into structured components.
            The code will be implemented in ${task.language.toLowerCase()}.
            
            Requirement:
            ${task.requirement_text}
            
            Please provide:
            1. A clear title for this requirement
            2. The main functionality being requested
            3. Key components or modules needed
            4. Expected inputs and outputs
            5. Any dependencies or constraints mentioned
            6. Suggested file structure for implementation
          `;

            const result = await this.llmIntegrationService.callLLmApi({
              prompt: analysisPrompt,
              systemMessage: this.systemMessage,
              options: {
                provider: requestedModel,
                useFallback: true,
              },
            });

            requirementAnalysis = this.parseAnalysisResult(result);
        }
      } else {
        requirementAnalysis = await this.analyzeRequirement(
          task.requirement_text,
          task.language,
        );
      }

      await this.requirementTaskService.updateTaskStatus({
        taskId,
        status: RequirementStatus.in_progress,
        progress: 0.3,
        details: {
          message: 'Requirement analyzed',
          analysis: requirementAnalysis,
          analysisModel: requestedModel,
        },
      });

      // Code generation
      let generatedCode;

      if (requestedModel.includes('ollama')) {
        switch (requestedModel) {
          case LLMProvider.OLLAMA_KEVIN:
            const kevinResponse =
              await this.llmIntegrationService.generateWithKevinModel({
                prompt:
                  `Generate code in ${task.language.toLowerCase()} for: ${
                    requirementAnalysis.title
                  }\n` +
                  `Functionality: ${requirementAnalysis.functionality}\n` +
                  `Components: ${this.formatList(
                    requirementAnalysis.components,
                  )}`,
                systemMessage: this.systemMessage,
              });
            generatedCode = this.extractJsonFromText(kevinResponse);
            break;
          default:
            generatedCode =
              await this.llmIntegrationService.generateCodeWithOllamaModel({
                requirementAnalysis,
                language: task.language,
                languageContext: this.getLanguageContext(task.language),
                systemMessage: this.systemMessage,
                provider: requestedModel,
                temperature: 0.2,
              });
        }
      } else {
        generatedCode = await this.generateCode(
          requirementAnalysis,
          task.language,
        );
      }
      const codeGeneratedEvent = new CodeGeneratedEvent({
        modelToUse: requestedModel,
        task,
        generatedCode,
        requirementAnalysis,
      });
      this.eventEmitter.emit(EventType.CODE_GENERATION, codeGeneratedEvent);
    } catch (error) {
      this.logger.error(
        `Error processing task with specific model ${taskId}: ${error.message}`,
        error.stack,
      );
      await this.requirementTaskService.updateTaskStatus({
        taskId,
        status: RequirementStatus.failed,
        progress: 0,
        details: { error: error.message },
      });
    }
  }

  /**
   * Generate code with multiple Ollama models for comparison.
   *
   * Steps:
   * 1. Analyze requirement (DeepSeek Chat)
   * 2. Generate code with multiple models
   * 3. Select best output (by file count)
   * 4. Commit best output to main branch, others to comparison branches
   *
   * @param taskId Task ID to process
   */
  public async processRequirementWithModelComparison(
    taskId: string,
  ): Promise<void> {
    try {
      // Fetch task details
      const task = await this.prismaRepository.requirementTask.findUnique({
        where: { id: taskId },
      });

      if (!task) {
        throw new Error(`Task with ID ${taskId} not found`);
      }

      // Update status: starting multi-model analysis
      await this.requirementTaskService.updateTaskStatus({
        taskId,
        status: RequirementStatus.in_progress,
        progress: 0.1,
        details: { message: 'Starting multi-model requirement analysis' },
      });

      // Check Ollama availability
      const ollamaStatus =
        await this.llmIntegrationService.checkOllamaAvailability();

      if (!ollamaStatus.available) {
        throw new Error('Ollama is not available for multi-model comparison');
      }

      // Analyze requirement (DeepSeek Chat)
      const requirementAnalysis =
        await this.llmIntegrationService.analyzeRequirementWithOllama({
          requirementContext: task.requirement_text,
          language: task.language,
          systemMessage: this.systemMessage,
        });

      await this.requirementTaskService.updateTaskStatus({
        taskId,
        status: RequirementStatus.in_progress,
        progress: 0.3,
        details: {
          message: 'Requirement analyzed',
          analysis: requirementAnalysis,
        },
      });

      // Generate code with multiple models
      const multiModelResults =
        await this.llmIntegrationService.generateCodeWithOllamaModel({
          requirementAnalysis,
          language: task.language,
          languageContext: this.getLanguageContext(task.language),
          systemMessage: this.systemMessage,
          provider: LLMProvider.OLLAMA_DEEPSEEK_CHAT,
          temperature: 0.2,
        });

      // Select best model output (by file count)
      let bestModel = LLMProvider.OLLAMA_DEEPSEEK_CHAT;
      let maxFileCount = 0;
      let bestModelCode = {};

      for (const [model, codeFiles] of Object.entries(multiModelResults)) {
        const fileCount = Object.keys(codeFiles).length;
        if (fileCount > maxFileCount) {
          maxFileCount = fileCount;
          bestModelCode = codeFiles;
        }
      }

      if (Object.keys(bestModelCode).length === 0) {
        // Fallback to Kevin if all models failed
        const kevinResponse =
          await this.llmIntegrationService.generateWithKevinModel({
            prompt:
              `Generate code in ${task.language.toLowerCase()} for: ${
                requirementAnalysis.title
              }\n` +
              `Functionality: ${requirementAnalysis.functionality}\n` +
              `Components: ${this.formatList(requirementAnalysis.components)}`,
            systemMessage: this.systemMessage,
          });
        bestModelCode = this.extractJsonFromText(kevinResponse);
        bestModel = LLMProvider.OLLAMA_KEVIN;
      }

      const codeGeneratedEvent = new CodeGeneratedEvent({
        modelToUse: bestModel,
        task,
        generatedCode: bestModelCode,
        requirementAnalysis,
      });
      this.eventEmitter.emit(EventType.CODE_GENERATION, codeGeneratedEvent);
    } catch (error) {
      this.logger.error(
        `Error processing task with model comparison ${taskId}: ${error.message}`,
        error.stack,
      );
      await this.requirementTaskService.updateTaskStatus({
        taskId,
        status: RequirementStatus.failed,
        progress: 0,
        details: { error: error.message },
      });
    }
  }

  /**
   * Analyze and understand a requirement using LLM.
   *
   * @param requirementText The raw requirement text
   * @param language Target programming language
   * @private
   */
  private async analyzeRequirement(
    requirementText: string,
    language: CodeLanguage,
  ): Promise<Record<string, any>> {
    const prompt = `
      Analyze the following software requirement and break it down into structured components.
      The code will be implemented in ${language.toLowerCase()}.
      
      Requirement:
      ${requirementText}
      
      Please provide:
      1. A clear title for this requirement
      2. The main functionality being requested
      3. Key components or modules needed
      4. Expected inputs and outputs
      5. Any dependencies or constraints mentioned
      6. Suggested file structure for implementation
    `;

    const result = await this.llmIntegrationService.callLLmApi({
      prompt,
      systemMessage: this.systemMessage,
      options: {
        // use default LLMProvider.OPENAI
      },
    });

    // Parse the LLM response into a structured format
    return this.parseAnalysisResult(result);
  }

  /**
   * Generate code based on the analyzed requirement.
   *
   * @param requirementAnalysis Structured analysis of the requirement
   * @param language Target programming language
   * @private
   */
  private async generateCode(
    requirementAnalysis: Record<string, any>,
    language: CodeLanguage,
  ): Promise<Record<string, string>> {
    // Prepare language-specific context
    const languageContext = this.getLanguageContext(language);

    // Create the main prompt for code generation
    const prompt = `
      Generate code in ${language.toLowerCase()} based on the following analyzed requirement:
      
      Title: ${requirementAnalysis.title}
      
      Functionality: ${requirementAnalysis.functionality}
      
      Components needed:
      ${this.formatList(requirementAnalysis.components)}
      
      Inputs and Outputs:
      ${requirementAnalysis.inputsOutputs}
      
      Dependencies and Constraints:
      ${requirementAnalysis.dependencies}
      
      File Structure:
      ${this.formatList(requirementAnalysis.fileStructure)}
      
      ${languageContext}
      
      For each file in the file structure, provide the complete code with proper documentation.
      Format the response as a JSON object where keys are file paths and values are the file content.
    `;

    const result = await this.llmIntegrationService.callLLmApi({
      prompt,
      systemMessage: this.systemMessage,
      options: {
        // use default LLMProvider.OPENAI
      },
    });

    // Extract the code from the LLM response
    try {
      // Try to parse directly as JSON
      return JSON.parse(result);
    } catch (error) {
      // Fallback: extract JSON block from text response
      return this.extractJsonFromText(result);
    }
  }

  /**
   * Get language-specific context for code generation.
   *
   * @param language Target programming language
   * @private
   */
  private getLanguageContext(language: CodeLanguage): string {
    // Provide specific guidance based on language
    const contexts = {
      typescript: `
        Use TypeScript best practices:
        - Use interfaces for data structures
        - Apply proper typing throughout the code
        - Leverage decorators when appropriate
        - Follow NestJS patterns (controllers, services, modules)
        - Use dependency injection
        - Implement error handling with try/catch
        - Add JSDoc comments for all functions and classes
      `,
      javascript: `
        Use JavaScript best practices:
        - Use ES6+ features (arrow functions, destructuring, etc.)
        - Apply proper error handling with try/catch
        - Add JSDoc comments for all functions and classes
        - Implement async/await patterns for asynchronous code
      `,
      python: `
        Use Python best practices:
        - Follow PEP 8 style guidelines
        - Use type hints (Python 3.5+)
        - Add docstrings for all functions and classes
        - Implement proper error handling with try/except
      `,
      java: `
        Use Java best practices:
        - Follow standard Java conventions
        - Use appropriate design patterns
        - Implement proper exception handling
        - Add JavaDoc comments for all methods and classes
      `,
      // Add other languages as needed
    };

    const languageKey = language.toString().toLowerCase();
    return (
      contexts[languageKey] ||
      'Follow standard coding conventions and best practices for this language.'
    );
  }

  /**
   * Parse analysis result from LLM response.
   *
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
      fileStructure: this.extractFileStructure(result),
    };
  }

  /**
   * Extract a title from LLM response.
   *
   * @param text LLM response text
   * @private
   */
  private extractTitle(text: string): string {
    const titleRegex = /(?:title|name):\s*(.*?)(?:\n|$)/i;
    const match = text.match(titleRegex);
    return match ? match[1].trim() : 'Untitled Requirement';
  }

  /**
   * Extract a specific section from LLM response.
   *
   * @param text LLM response text
   * @param section Section name to extract
   * @private
   */
  private extractSection(text: string, section: string): string {
    const sectionRegex = new RegExp(
      `(?:${section}|\\d+\\.\\s*(?:[\\w\\s]+${section}[\\w\\s]+)):?\\s*([\\s\\S]*?)(?:\\n\\s*\\d+\\.|\\n\\s*(?:[A-Z]|\\w+:)|$)`,
      'i',
    );
    const match = text.match(sectionRegex);
    return match ? match[1].trim() : '';
  }

  /**
   * Extract components from LLM response.
   *
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
    const componentLines = componentsSection
      .split(/\n\s*[-*•]|\n\s*\d+\.\s+/)
      .filter(Boolean);

    return componentLines.map((line) => line.trim());
  }

  /**
   * Extract file structure from LLM response.
   *
   * @param text LLM response text
   * @private
   */
  private extractFileStructure(text: string): string[] {
    const fileStructureSection = this.extractSection(text, 'file structure');

    if (!fileStructureSection) {
      return [];
    }

    // Split by bullet points, numbered items, or file paths
    const fileLines = fileStructureSection
      .split(/\n\s*[-*•]|\n\s*\d+\.\s+|\n\s*(?:\/|\\)/)
      .filter(Boolean);

    return fileLines.map((line) => {
      // Clean up file paths
      const cleaned = line.trim().replace(/^(?:\/|\\|-\s*|•\s*|\d+\.\s*)/, '');
      return cleaned;
    });
  }

  /**
   * Format a list of items for prompting.
   *
   * @param items List of items
   * @private
   */
  private formatList(items: string[]): string {
    if (!items || items.length === 0) {
      return 'None specified';
    }

    return items.map((item) => `- ${item}`).join('\n');
  }

  /**
   * Extract JSON from text response when direct parsing fails.
   *
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
        const content = codeBlocks[i]
          .replace(/```(?:\w+)?\s*([\s\S]*?)```/, '$1')
          .trim();
        result[filePath] = content;
      }
    }

    return result;
  }
}
