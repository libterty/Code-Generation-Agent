// src/code-generation/services/code-generation.service.ts

import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigType } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { PrismaClient, CodeLanguage, RequirementStatus } from '.prisma/client';
import { Cluster as RedisCluster } from 'ioredis';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import simpleGit from 'simple-git';
import { llMConfig } from '@server/config/llm.config';
import { RequirementQueueService } from '@server/requirement-task/service/requirement-queue.service';
import { RequirementTaskService } from '@server/requirement-task/service/requirement-task.service';
import { PRISMA_REPOSITORY, REDIS_REPOSITORY, REQUIREMENT_TASK_SERVICE, REQUIREMENT_QUEUE_SERVICE } from '@server/constants';

@Injectable()
export class CodeGenerationServiceImpl implements OnModuleInit {
  private readonly logger = new Logger(CodeGenerationServiceImpl.name);

  constructor(
    private readonly httpService: HttpService,
    
    @Inject(llMConfig.KEY)
    private config: ConfigType<typeof llMConfig>,
    
    @Inject(PRISMA_REPOSITORY)
    private prismaRepository: PrismaClient,

    @Inject(REDIS_REPOSITORY)
    private readonly redisRepository: RedisCluster,
    
    @Inject(REQUIREMENT_TASK_SERVICE)
    private readonly requirementTaskService: RequirementTaskService,

    @Inject(REQUIREMENT_QUEUE_SERVICE)
    private readonly requirementQueueService: RequirementQueueService,
  ) {}

  /**
   * Initialize the service
   */
  async onModuleInit() {
    this.logger.log('Code Generation Service initialized');
  }

  /**
   * Process a requirement task
   * This method will be called by the RequirementTaskService when a task is ready
   * @param taskId Task ID to process
   */
  async processRequirement(taskId: string): Promise<void> {
    try {
      // Get the task details from the database
      const task = await this.prismaRepository.requirementTask.findUnique({
        where: { id: taskId }
      });
      
      if (!task) {
        throw new Error(`Task with ID ${taskId} not found`);
      }

      // Update status to processing
      await this.requirementTaskService.updateTaskStatus({
        taskId, 
        status: RequirementStatus.in_progress, 
        progress :0.1, 
        details: { message: 'Starting requirement analysis' }
      });

      // Step 1: Analyze and understand the requirement
      const requirementAnalysis = await this.analyzeRequirement(
        task.requirement_text, 
        task.language
      );
      
      await this.requirementTaskService.updateTaskStatus({
        taskId, 
        status: RequirementStatus.in_progress, 
        progress: 0.3, 
        details: { 
          message: 'Requirement analyzed', 
          analysis: requirementAnalysis 
        }
      });

      // Step 2: Generate code based on the requirement analysis
      const generatedCode = await this.generateCode(
        requirementAnalysis, 
        task.language
      );
      
      await this.requirementTaskService.updateTaskStatus({
        taskId, 
        status: RequirementStatus.in_progress, 
        progress: 0.6, 
        details: { 
          message: 'Code generated'
        }
      });

      // Step 3: Commit the generated code to Git repository
      const outputPath = task.output_path || this.determineOutputPath(requirementAnalysis, task.language);
      
      const commitResult = await this.commitToGit(
        task.repository_url,
        task.branch,
        generatedCode,
        outputPath,
        task.requirement_text,
        requirementAnalysis
      );

      // Update final status
      await this.requirementTaskService.updateTaskStatus({
        taskId, 
        status: RequirementStatus.completed,
        progress: 1.0, 
        details: {
          message: 'Code generated and committed to repository',
          commitHash: commitResult.commitHash,
          filesChanged: commitResult.filesChanged
        }
      
      });

    } catch (error) {
      this.logger.error(`Error processing task ${taskId}: ${error.message}`, error.stack);
      await this.requirementTaskService.updateTaskStatus({
        taskId, 
        status: RequirementStatus.failed, 
        progress: 0, 
        details: { error: error.message }
      });
    }
  }

  /**
   * Analyze and understand a requirement using LLM
   * @param requirementText The raw requirement text
   * @param language Target programming language
   * @private
   */
  private async analyzeRequirement(requirementText: string, language: CodeLanguage): Promise<Record<string, any>> {
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

    const result = await this.callLlmApi(prompt);

    // Parse the LLM response into a structured format
    const analysis = {
      title: this.extractTitle(result),
      functionality: this.extractSection(result, 'main functionality'),
      components: this.extractComponents(result),
      inputsOutputs: this.extractSection(result, 'inputs and outputs'),
      dependencies: this.extractSection(result, 'dependencies or constraints'),
      fileStructure: this.extractFileStructure(result)
    };

    return analysis;
  }

  /**
   * Generate code based on the analyzed requirement
   * @param requirementAnalysis Structured analysis of the requirement
   * @param language Target programming language
   * @private
   */
  private async generateCode(requirementAnalysis: Record<string, any>, language: CodeLanguage): Promise<Record<string, string>> {
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

    const result = await this.callLlmApi(prompt);

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
   * Commit generated code to a Git repository
   * @param repositoryUrl URL of the Git repository
   * @param branch Branch to commit to
   * @param generatedCode Generated code files
   * @param outputPath Base path for output files
   * @param requirementText Original requirement text
   * @param requirementAnalysis Requirement analysis
   * @private
   */
  private async commitToGit(
    repositoryUrl: string,
    branch: string,
    generatedCode: Record<string, string>,
    outputPath: string,
    requirementText: string,
    requirementAnalysis: Record<string, any>
  ): Promise<{ commitHash: string; filesChanged: string[] }> {
    // Create a temporary directory for the repository
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-agent-'));
    
    try {
      // Initialize Git
      const git = simpleGit();
      
      // Set up Git configuration
      await git.addConfig('user.name', process.env.GIT_USERNAME || 'mcp-agent');
      await git.addConfig('user.email', process.env.GIT_EMAIL || 'mcp-agent@example.com');
      
      // Configure SSH if needed (for private repositories)
      const sshKeyPath = process.env.GIT_SSH_KEY_PATH;
      if (sshKeyPath) {
        git.env('GIT_SSH_COMMAND', `ssh -i ${sshKeyPath} -o StrictHostKeyChecking=no`);
      }
      
      // Clone the repository
      this.logger.log(`Cloning repository ${repositoryUrl} to ${tempDir}`);
      await git.clone(repositoryUrl, tempDir);
      
      // Switch to working directory
      const workingGit = simpleGit(tempDir);
      
      // Check out the specified branch
      const branches = await workingGit.branch();
      
      if (branches.all.includes(branch) || branches.all.includes(`remotes/origin/${branch}`)) {
        await workingGit.checkout(branch);
      } else {
        // Create a new branch if it doesn't exist
        await workingGit.checkoutLocalBranch(branch);
      }
      
      // Write files to the repository
      const filesChanged: string[] = [];
      
      for (const [filePath, content] of Object.entries(generatedCode)) {
        const fullPath = path.join(tempDir, outputPath, filePath);
        
        // Ensure directory exists
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        
        // Write file content
        fs.writeFileSync(fullPath, content);
        
        // Add to tracked files
        filesChanged.push(path.join(outputPath, filePath));
      }
      
      // Stage all changes
      await workingGit.add(filesChanged);
      
      // Create commit message
      const commitMessage = `feat: implement ${requirementAnalysis.title || 'new requirement'}\n\n${requirementText.substring(0, 200)}${requirementText.length > 200 ? '...' : ''}`;
      
      // Commit changes
      const commitResult = await workingGit.commit(commitMessage);
      
      // Push changes to remote
      await workingGit.push('origin', branch);
      
      this.logger.log(`Successfully committed and pushed changes to ${repositoryUrl}:${branch}`);
      
      return {
        commitHash: commitResult.commit,
        filesChanged,
      };
    } catch (error) {
      this.logger.error(`Error committing to Git: ${error.message}`, error.stack);
      throw new Error(`Failed to commit to Git repository: ${error.message}`);
    } finally {
      // Clean up temporary directory
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        this.logger.debug(`Cleaned up temporary directory: ${tempDir}`);
      } catch (cleanupError) {
        this.logger.warn(`Failed to clean up temporary directory: ${cleanupError.message}`);
      }
    }
  }

  /**
   * Call the LLM API with a prompt
   * @param prompt The prompt to send to the LLM
   * @private
   */
  private async callLlmApi(prompt: string): Promise<string> {
    try {
      const response = await lastValueFrom(
        this.httpService.post(
          this.config.llmApiUrl,
          {
            model: this.config.llmApiModel,
            messages: [
              { role: 'system', content: 'You are a helpful assistant specialized in software development.' },
              { role: 'user', content: prompt }
            ],
            temperature: 0.2,
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.config.llmApiKey}`,
            },
          }
        ),
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      this.logger.error(`Error calling LLM API: ${error.message}`);
      throw new Error(`Failed to call LLM API: ${error.message}`);
    }
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

  /**
   * Get language-specific context for code generation
   * @param language Target programming language
   * @private
   */
  private getLanguageContext(language: CodeLanguage): string {
    // Provide specific guidance based on language
    const contexts = {
      'typescript': `
        Use TypeScript best practices:
        - Use interfaces for data structures
        - Apply proper typing throughout the code
        - Leverage decorators when appropriate
        - Follow NestJS patterns (controllers, services, modules)
        - Use dependency injection
        - Implement error handling with try/catch
        - Add JSDoc comments for all functions and classes
      `,
      'javascript': `
        Use JavaScript best practices:
        - Use ES6+ features (arrow functions, destructuring, etc.)
        - Apply proper error handling with try/catch
        - Add JSDoc comments for all functions and classes
        - Implement async/await patterns for asynchronous code
      `,
      'python': `
        Use Python best practices:
        - Follow PEP 8 style guidelines
        - Use type hints (Python 3.5+)
        - Add docstrings for all functions and classes
        - Implement proper error handling with try/except
      `,
      'java': `
        Use Java best practices:
        - Follow standard Java conventions
        - Use appropriate design patterns
        - Implement proper exception handling
        - Add JavaDoc comments for all methods and classes
      `,
      // Add other languages as needed
    };
    
    const languageKey = language.toString().toLowerCase();
    return contexts[languageKey] || 'Follow standard coding conventions and best practices for this language.';
  }
  
  /**
   * Determine the appropriate output path based on requirement analysis
   * @param analysis Requirement analysis
   * @param language Target programming language
   * @private
   */
  private determineOutputPath(analysis: Record<string, any>, language: CodeLanguage): string {
    // Default paths based on language
    const defaultPaths = {
      'typescript': 'src',
      'javascript': 'src',
      'python': 'src',
      'java': 'src/main/java',
      'go': 'pkg',
      'rust': 'src',
      'csharp': 'src',
      'ruby': 'lib',
      'php': 'src',
    };

    // Try to infer a meaningful path from the analysis
    if (analysis.fileStructure && analysis.fileStructure.length > 0) {
      // Look for common root directory in file structure
      const paths = analysis.fileStructure.map(file => {
        if (typeof file === 'string') {
          const parts = file.split('/');
          return parts[0];
        }
        return null;
      }).filter(Boolean);

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
}