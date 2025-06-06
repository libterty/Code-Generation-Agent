// src/code-generation/services/code-generation.service.ts

import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PrismaClient, CodeLanguage, RequirementStatus } from '.prisma/client';
import { Cluster as RedisCluster } from 'ioredis';
import { LLMService } from '@server/core/llm/service/llm.service';
import { LLMIntegrationService } from '@server/core/llm/service/llm-integration.service';
import { RequirementQueueService } from '@server/requirement-task/service/requirement-queue.service';
import { RequirementTaskService } from '@server/requirement-task/service/requirement-task.service';
import { GitIntegrationService } from '@server/git-integration/service/git-integration.service';
import { QualityCheckService } from '@server/quality-check/service/quality-check.service';
import {
  RequestLLMDto,
  RequestLLMWithOllamaDto,
  AnalyzeLLMWithOllamaDto,
  RequestLLMWithOllamaKevinDto,
  OllamaModelTestDto,
} from '@server/core/llm/dto/llm.dto';
import {
  PRISMA_REPOSITORY,
  REDIS_REPOSITORY,
  REQUIREMENT_TASK_SERVICE,
  REQUIREMENT_QUEUE_SERVICE,
  LLM_SERVICE,
  LLM_INTEGRATION_SERVICE,
  GIT_INTEGRATION_SERVICE,
  QUALITY_CHECK_SERVICE,
} from '@server/constants';
import { LLMProvider } from '@server/config/llm.config';

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
export class CodeGenerationServiceImpl implements OnModuleInit {
  private readonly logger = new Logger(CodeGenerationServiceImpl.name);
  // System message for LLM context
  private readonly systemMessage =
    'You are a helpful assistant specialized in software development.';

  constructor(
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
  async onModuleInit() {
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
  async processRequirement(taskId: string): Promise<void> {
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
      if (useOllama) {
        const kevinAvailable =
          await this.llmIntegrationService.testSpecificOllamaModel({
            modelName: 'kevin',
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
        }
      } else {
        generatedCode = await this.generateCode(
          requirementAnalysis,
          task.language,
        );
      }

      await this.requirementTaskService.updateTaskStatus({
        taskId,
        status: RequirementStatus.in_progress,
        progress: 0.5,
        details: {
          message: 'Code generated',
        },
      });

      // 4. Code quality check
      const qualityResult = await this.qualityCheckService.checkCodeQuality(
        generatedCode,
        requirementAnalysis,
        task.language,
        taskId,
      );

      await this.requirementTaskService.updateTaskStatus({
        taskId,
        status: RequirementStatus.in_progress,
        progress: 0.7,
        details: {
          message: 'Code quality verified',
          qualityResult: {
            passed: qualityResult.passed,
            codeQualityScore: qualityResult.codeQualityScore,
            requirementCoverageScore: qualityResult.requirementCoverageScore,
            syntaxValidityScore: qualityResult.syntaxValidityScore,
            feedback: qualityResult.feedback,
          },
        },
      });

      // 5. Commit code to Git
      const outputPath =
        task.output_path ||
        this.determineOutputPath(requirementAnalysis, task.language);

      const commitResult = await this.gitIntegrationService.commitToGit({
        repositoryUrl: task.repository_url,
        branch: task.branch,
        generatedCode,
        outputPath,
        requirementText: task.requirement_text,
        requirementAnalysis,
      });

      // Final status update
      await this.requirementTaskService.updateTaskStatus({
        taskId,
        status: RequirementStatus.completed,
        progress: 1.0,
        details: {
          message:
            'Code generated, quality verified, and committed to repository',
          commitHash: commitResult.commitHash,
          filesChanged: commitResult.filesChanged,
          generatedWith: useOllama ? 'Ollama' : 'Default LLM',
          qualityPassed: qualityResult.passed,
          qualityScores: {
            overall:
              qualityResult.codeQualityScore * 0.5 +
              qualityResult.requirementCoverageScore * 0.3 +
              qualityResult.syntaxValidityScore * 0.2,
            codeQuality: qualityResult.codeQualityScore,
            requirementCoverage: qualityResult.requirementCoverageScore,
            syntaxValidity: qualityResult.syntaxValidityScore,
          },
        },
      });
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
  async processRequirementWithSpecificModel(
    taskId: string,
    modelName?: string,
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
          requestedModel: modelName || 'default',
        },
      });

      // Model selection logic
      let modelToUse = '';
      let modelProvider: LLMProvider | null = null;

      if (modelName) {
        // Check if requested model is available
        const isAvailable =
          await this.llmIntegrationService.testSpecificOllamaModel({
            modelName,
            systemMessage: this.systemMessage,
          });

        if (isAvailable) {
          modelToUse = modelName;
          // Convert model name to provider enum
          modelProvider = `ollama-${modelName}`
            .replace(/-/g, '_')
            .toUpperCase() as LLMProvider;
          this.logger.log(`Using requested model: ${modelName}`);
        } else {
          this.logger.warn(
            `Requested model ${modelName} is not available, checking alternatives`,
          );
        }
      }

      // If no specific model, select by priority
      if (!modelProvider) {
        const ollamaStatus =
          await this.llmIntegrationService.checkOllamaAvailability();

        if (ollamaStatus.available) {
          // Priority: kevin > deepseek-coder > llama3 > qwen2
          const priorityModels = ['kevin', 'deepseek-coder', 'llama3', 'qwen2'];

          for (const model of priorityModels) {
            const modelEnum = `OLLAMA_${model
              .toUpperCase()
              .replace(/-/g, '_')}` as keyof typeof LLMProvider;
            if (
              ollamaStatus.models.includes(LLMProvider[modelEnum]) ||
              (await this.llmIntegrationService.testSpecificOllamaModel({
                modelName: model,
                systemMessage: this.systemMessage,
              }))
            ) {
              modelToUse = model;
              modelProvider = LLMProvider[modelEnum];
              this.logger.log(`Selected model based on availability: ${model}`);
              break;
            }
          }
        }
      }

      // Requirement analysis
      let requirementAnalysis;

      if (modelToUse) {
        // Use specific Ollama model for analysis
        if (modelToUse === 'deepseek-chat') {
          requirementAnalysis =
            await this.llmIntegrationService.analyzeRequirementWithOllama({
              requirementContext: task.requirement_text,
              language: task.language,
              systemMessage: this.systemMessage,
            });
        } else {
          // Use specified model with custom prompt
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
              provider: modelProvider,
              useFallback: true,
            },
          });

          requirementAnalysis = this.parseAnalysisResult(result);
        }
      } else {
        // Fallback to default analysis
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
          analysisModel: modelToUse || 'default',
        },
      });

      // Code generation
      let generatedCode;

      if (modelToUse) {
        if (modelToUse === 'kevin') {
          // Use Kevin model
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
        } else {
          // Use specified model
          generatedCode =
            await this.llmIntegrationService.generateCodeWithOllamaModel({
              requirementAnalysis,
              language: task.language,
              languageContext: this.getLanguageContext(task.language),
              systemMessage: this.systemMessage,
              provider: modelProvider,
              temperature: 0.2,
            });
        }
      } else {
        // Fallback to default code generation
        generatedCode = await this.generateCode(
          requirementAnalysis,
          task.language,
        );
      }

      await this.requirementTaskService.updateTaskStatus({
        taskId,
        status: RequirementStatus.in_progress,
        progress: 0.5,
        details: {
          message: 'Code generated',
          generationModel: modelToUse || 'default',
        },
      });

      // Code quality check
      const qualityResult = await this.qualityCheckService.checkCodeQuality(
        generatedCode,
        requirementAnalysis,
        task.language,
        taskId,
      );

      await this.requirementTaskService.updateTaskStatus({
        taskId,
        status: RequirementStatus.in_progress,
        progress: 0.7,
        details: {
          message: 'Code quality verified',
          qualityResult: {
            passed: qualityResult.passed,
            codeQualityScore: qualityResult.codeQualityScore,
            requirementCoverageScore: qualityResult.requirementCoverageScore,
            syntaxValidityScore: qualityResult.syntaxValidityScore,
            feedback: qualityResult.feedback,
          },
        },
      });

      // Commit code to Git
      const outputPath =
        task.output_path ||
        this.determineOutputPath(requirementAnalysis, task.language);

      const commitResult = await this.gitIntegrationService.commitToGit({
        repositoryUrl: task.repository_url,
        branch: task.branch,
        generatedCode,
        outputPath,
        requirementText: task.requirement_text,
        requirementAnalysis,
      });

      // Final status update
      await this.requirementTaskService.updateTaskStatus({
        taskId,
        status: RequirementStatus.completed,
        progress: 1.0,
        details: {
          message:
            'Code generated, quality verified, and committed to repository',
          commitHash: commitResult.commitHash,
          filesChanged: commitResult.filesChanged,
          analysisModel: modelToUse || 'default',
          generationModel: modelToUse || 'default',
          qualityPassed: qualityResult.passed,
          qualityScores: {
            overall:
              qualityResult.codeQualityScore * 0.5 +
              qualityResult.requirementCoverageScore * 0.3 +
              qualityResult.syntaxValidityScore * 0.2,
            codeQuality: qualityResult.codeQualityScore,
            requirementCoverage: qualityResult.requirementCoverageScore,
            syntaxValidity: qualityResult.syntaxValidityScore,
          },
        },
      });
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
  async processRequirementWithModelComparison(taskId: string): Promise<void> {
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
        });

      // Select best model output (by file count)
      let bestModel = '';
      let maxFileCount = 0;
      let bestModelCode = {};

      for (const [model, codeFiles] of Object.entries(multiModelResults)) {
        const fileCount = Object.keys(codeFiles).length;
        if (fileCount > maxFileCount) {
          maxFileCount = fileCount;
          bestModel = model;
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
        bestModel = 'kevin-fallback';
      }

      await this.requirementTaskService.updateTaskStatus({
        taskId,
        status: RequirementStatus.in_progress,
        progress: 0.5,
        details: {
          message: 'Code generated with multiple models',
          modelComparison: Object.keys(multiModelResults).map((model) => ({
            model,
            fileCount: Object.keys(multiModelResults[model]).length,
          })),
          selectedModel: bestModel,
        },
      });

      // Code quality check for best model
      const qualityResult = await this.qualityCheckService.checkCodeQuality(
        bestModelCode as Record<string, string>,
        requirementAnalysis,
        task.language,
        taskId,
      );

      await this.requirementTaskService.updateTaskStatus({
        taskId,
        status: RequirementStatus.in_progress,
        progress: 0.7,
        details: {
          message: 'Code quality verified',
          qualityResult: {
            passed: qualityResult.passed,
            codeQualityScore: qualityResult.codeQualityScore,
            requirementCoverageScore: qualityResult.requirementCoverageScore,
            syntaxValidityScore: qualityResult.syntaxValidityScore,
            feedback: qualityResult.feedback,
          },
        },
      });

      // Commit best model code to main branch
      const outputPath =
        task.output_path ||
        this.determineOutputPath(requirementAnalysis, task.language);

      const commitResult = await this.gitIntegrationService.commitToGit({
        repositoryUrl: task.repository_url,
        branch: task.branch,
        generatedCode: bestModelCode as Record<string, string>,
        outputPath,
        requirementText: task.requirement_text,
        requirementAnalysis,
      });

      // Commit all model outputs to comparison branches
      const comparisonBranches = [];

      for (const [modelKey, codeFiles] of Object.entries(multiModelResults)) {
        // Skip best model and empty results
        if (modelKey !== bestModel && Object.keys(codeFiles).length > 0) {
          try {
            // Clean model name for branch
            const cleanModelName = modelKey
              .replace(/OLLAMA_|ollama-|ollama_/i, '')
              .toLowerCase();
            const modelBranch = `${task.branch}-${cleanModelName}`;

            // Type safety for code files
            const typedCodeFiles: Record<string, string> = {};

            let isValid = true;
            for (const [filePath, content] of Object.entries(codeFiles)) {
              if (typeof filePath === 'string' && typeof content === 'string') {
                typedCodeFiles[filePath] = content;
              } else {
                this.logger.warn(
                  `Invalid entry in model ${modelKey} output: ${filePath} -> ${typeof content}`,
                );
                isValid = false;
                break;
              }
            }

            if (!isValid || Object.keys(typedCodeFiles).length === 0) {
              this.logger.warn(
                `Skipping commit for model ${modelKey} due to invalid output format`,
              );
              continue;
            }

            // Commit message with model info
            const modelCommitText = `${task.requirement_text} (Generated with ${cleanModelName} model)`;

            const modelCommitResult =
              await this.gitIntegrationService.commitToGit({
                repositoryUrl: task.repository_url,
                branch: modelBranch,
                generatedCode: typedCodeFiles,
                outputPath,
                requirementText: modelCommitText,
                requirementAnalysis,
              });

            comparisonBranches.push({
              model: cleanModelName,
              branch: modelBranch,
              commitHash: modelCommitResult.commitHash,
              fileCount: Object.keys(typedCodeFiles).length,
            });

            this.logger.log(
              `Successfully committed ${cleanModelName} output to branch ${modelBranch}`,
            );
          } catch (error) {
            this.logger.warn(
              `Failed to commit ${modelKey} output: ${error.message}`,
            );
          }
        }
      }

      // Final status update
      await this.requirementTaskService.updateTaskStatus({
        taskId,
        status: RequirementStatus.completed,
        progress: 1.0,
        details: {
          message:
            'Code generated with multiple models, quality verified, and committed to repository',
          commitHash: commitResult.commitHash,
          filesChanged: commitResult.filesChanged,
          generatedWith: bestModel,
          comparisonBranches,
          qualityPassed: qualityResult.passed,
          qualityScores: {
            overall:
              qualityResult.codeQualityScore * 0.5 +
              qualityResult.requirementCoverageScore * 0.3 +
              qualityResult.syntaxValidityScore * 0.2,
            codeQuality: qualityResult.codeQualityScore,
            requirementCoverage: qualityResult.requirementCoverageScore,
            syntaxValidity: qualityResult.syntaxValidityScore,
          },
        },
      });
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
      options: {},
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
      options: {},
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
   * Determine the appropriate output path based on requirement analysis.
   * 
   * @param analysis Requirement analysis
   * @param language Target programming language
   * @private
   */
  private determineOutputPath(
    analysis: Record<string, any>,
    language: CodeLanguage,
  ): string {
    // Default paths based on language
    const defaultPaths = {
      typescript: 'src',
      javascript: 'src',
      python: 'src',
      java: 'src/main/java',
      go: 'pkg',
      rust: 'src',
      csharp: 'src',
      ruby: 'lib',
      php: 'src',
    };

    // Try to infer a meaningful path from the analysis
    if (analysis.fileStructure && analysis.fileStructure.length > 0) {
      // Look for common root directory in file structure
      const paths = analysis.fileStructure
        .map((file) => {
          if (typeof file === 'string') {
            const parts = file.split('/');
            return parts[0];
          }
          return null;
        })
        .filter(Boolean);

      if (paths.length > 0) {
        // Use most common directory
        const pathCounts = {};
        let maxCount = 0;
        let mostCommonPath = '';

        for (const p of paths) {
          pathCounts[p] = (pathCounts[p] || 0) + 1;
          if (pathCounts[p] > maxCount) {
            maxCount = pathCounts[p];
            mostCommonPath = p;
          }
        }

        if (mostCommonPath) {
          return mostCommonPath;
        }
      }
    }

    // Fallback to default path for the language
    const languageKey = language.toString().toLowerCase();
    return defaultPaths[languageKey] || 'src';
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
