// src/requirement-task/services/requirement-task.service.ts

import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaClient, RequirementStatus } from '.prisma/client';
import { RequirementTaskService } from '@server/requirement-task/service/requirement-task.service';
import { RequirementQueueService } from '@server/requirement-task/service/requirement-queue.service';
import {
  RequirementRequestDto,
  RequirementResponseDto,
  QueryRequirementTaskDto,
  UpdateTaskStatusDto,
  UpdateTaskQualityMetricsDto,
  TaskStatusDto,
} from '@server/requirement-task/dto/requirement-task.dto';
import {
  PRISMA_REPOSITORY,
  REQUIREMENT_QUEUE_SERVICE,
} from '@server/constants';

@Injectable()
export class RequirementTaskServiceImpl implements RequirementTaskService {
  private readonly logger = new Logger(RequirementTaskServiceImpl.name);

  constructor(
    @Inject(PRISMA_REPOSITORY)
    private prismaRepository: PrismaClient,

    @Inject(REQUIREMENT_QUEUE_SERVICE)
    private requirementQueueService: RequirementQueueService,
  ) {
    // Register the task processor with the queue service
    this.requirementQueueService.registerTaskProcessor(
      this.processRequirementTask.bind(this),
    );
  }

  /**
   * Create a new requirement task and queue it for processing
   * @param requirement The requirement details
   * @returns Task ID and status
   */
  public async createRequirementTask(
    requirement: RequirementRequestDto,
  ): Promise<RequirementResponseDto> {
    this.logger.log(
      `Creating new requirement task for project ${requirement.projectId}`,
    );

    return this.prismaRepository.$transaction(async (tx) => {
      // Create a new task record in the database
      const task = await tx.requirementTask.create({
        data: {
          project_id: requirement.projectId,
          repository_url: requirement.repositoryUrl,
          branch: requirement.branch,
          requirement_text: requirement.requirementText,
          priority: requirement.priority,
          additional_context: requirement.additionalContext,
          language: requirement.language,
          output_path: requirement.outputPath,
          status: RequirementStatus.pending,
          progress: 0,
          details: { message: 'Task created and queued for processing' },
        },
      });

      // Add the task to the processing queue
      await this.requirementQueueService.addTask(task.id, requirement.priority);

      return {
        taskId: task.id,
        status: RequirementStatus.pending,
        message: 'Requirement task created and queued for processing',
      };
    });
  }

  /**
   * Get the current status of a requirement task
   * @param taskId Task ID
   * @returns Current task status
   */
  public async getTaskStatus(taskId: string): Promise<TaskStatusDto> {
    // 取得任務基本資訊
    const task = await this.prismaRepository.requirementTask.findUnique({
      where: { id: taskId },
      include: {
        metrics: true, // 包含關聯的品質指標
      },
    });

    if (!task) {
      throw new Error(`Task with ID ${taskId} not found`);
    }

    // 取得佇列狀態資訊
    const queueInfo = await this.requirementQueueService.getJobStatus(taskId);

    // 組合回應資料
    const response: TaskStatusDto = {
      taskId: task.id,
      status: task.status,
      progress: task.progress,
      details:
        typeof task.details === 'string'
          ? JSON.parse(task.details)
          : (task.details as Record<string, any>),
      createdAt: task.created_at.toISOString(),
      updatedAt: task.updated_at.toISOString(),
      queueInfo: {
        state: queueInfo.state,
        progress: queueInfo.progress,
      },
      qualityMetrics: task.metrics.map((m) => ({
        codeQualityScore: m.code_quality_score,
        requirementCoverageScore: m.requirement_coverage_score,
        syntaxValidityScore: m.syntax_validity_score,
      })),
    };

    return response;
  }

  /**
   * List all requirement tasks with optional filtering
   * @param projectId Optional project ID filter
   * @param status Optional status filter
   * @returns Array of tasks
   */
  public async listTasks(
    dto: QueryRequirementTaskDto,
  ): Promise<TaskStatusDto[]> {
    // 取得任務列表，同時包含品質指標
    const tasks = await this.prismaRepository.requirementTask.findMany({
      where: {
        project_id: dto.projectId,
        status: dto.status,
      },
      orderBy: { created_at: 'desc' },
      include: {
        metrics: true,
      },
    });

    // 轉換為 DTO 格式
    return Promise.all(
      tasks.map(async (task) => {
        const queueInfo = await this.requirementQueueService.getJobStatus(
          task.id,
        );
        const taskDto: TaskStatusDto = {
          taskId: task.id,
          status: task.status,
          progress: task.progress,
          details: task.details as Record<string, any>,
          createdAt: task.created_at.toISOString(),
          updatedAt: task.updated_at.toISOString(),
          queueInfo: {
            state: queueInfo.state,
            progress: queueInfo.progress,
          },
          qualityMetrics: task.metrics.map((m) => ({
            codeQualityScore: m.code_quality_score,
            requirementCoverageScore: m.requirement_coverage_score,
            syntaxValidityScore: m.syntax_validity_score,
          })),
        };

        return taskDto;
      }),
    );
  }

  /**
   * Update the status of a task
   * @param taskId Task ID
   * @param status New status
   * @param progress Progress percentage (0-1)
   * @param details Additional details
   */
  public async updateTaskStatus(dto: UpdateTaskStatusDto): Promise<void> {
    const { taskId, status, progress, details } = dto;
    await this.prismaRepository.requirementTask.update({
      where: { id: taskId },
      data: {
        status,
        progress,
        details,
        updated_at: new Date(),
      },
    });

    this.logger.log(
      `Updated task ${taskId} status to ${status} with progress ${progress}`,
    );
  }

  /**
   * Add or update quality metrics for a task
   * @param taskId Task ID
   * @param codeQualityScore Code quality score
   * @param requirementCoverageScore Requirement coverage score
   * @param syntaxValidityScore Syntax validity score
   * @param staticAnalysisResults Static analysis results
   * @param feedback Feedback text
   */
  public async updateTaskQualityMetrics(
    dto: UpdateTaskQualityMetricsDto,
  ): Promise<void> {
    const {
      taskId,
      codeQualityScore,
      requirementCoverageScore,
      syntaxValidityScore,
      staticAnalysisResults,
      feedback,
    } = dto;

    // 檢查是否已存在品質指標
    const existingMetric = await this.prismaRepository.qualityMetric.findFirst({
      where: { task_id: taskId },
    });

    if (existingMetric) {
      // 更新現有品質指標
      await this.prismaRepository.qualityMetric.update({
        where: { id: existingMetric.id },
        data: {
          code_quality_score: codeQualityScore,
          requirement_coverage_score: requirementCoverageScore,
          syntax_validity_score: syntaxValidityScore,
          static_analysis_results: staticAnalysisResults,
          feedback,
        },
      });
    } else {
      // 創建新的品質指標
      await this.prismaRepository.qualityMetric.create({
        data: {
          task_id: taskId,
          code_quality_score: codeQualityScore,
          requirement_coverage_score: requirementCoverageScore,
          syntax_validity_score: syntaxValidityScore,
          static_analysis_results: staticAnalysisResults,
          feedback,
        },
      });
    }

    this.logger.log(`Updated quality metrics for task ${taskId}`);
  }

  /**
   * Process a requirement task (to be called by the queue worker)
   * This method will be called when the queue worker picks up a task
   * @param taskId Task ID to process
   */
  private async processRequirementTask(taskId: string): Promise<void> {
    // This method is registered with the queue service and will be called
    // when a task is ready to be processed. This is where you would integrate
    // with the CodeGenerationService to handle the actual processing.

    this.logger.log(`Received task ${taskId} for processing from queue`);

    // For now, we'll just update the status to show it's been received
    await this.updateTaskStatus({
      taskId,
      status: RequirementStatus.in_progress,
      progress: 0.1,
      details: { message: 'Task received from queue and is being processed' },
    });
    // The actual processing will be handled by the CodeGenerationService
    // which will be injected into that service
  }
}
