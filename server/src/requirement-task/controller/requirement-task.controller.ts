// src/requirement-task/controllers/requirement-task.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  Logger,
  Inject,
} from '@nestjs/common';
import { PrismaClient, RequirementStatus } from '.prisma/client';
import { RequirementTaskService } from '@server/requirement-task/service/requirement-task.service';
import { RequirementQueueService } from '@server/requirement-task//service/requirement-queue.service';
import {
  RequirementRequestDto,
  RequirementResponseDto,
  TaskStatusDto,
  QueueStatsDto,
} from '../dto/requirement-task.dto';
import {
  REQUIREMENT_TASK_SERVICE,
  REQUIREMENT_QUEUE_SERVICE,
} from '@server/constants';

@Controller('requirement-tasks')
export class RequirementTaskController {
  private readonly logger = new Logger(RequirementTaskController.name);

  constructor(
    @Inject(REQUIREMENT_TASK_SERVICE)
    private readonly requirementTaskService: RequirementTaskService,
    @Inject(REQUIREMENT_QUEUE_SERVICE)
    private readonly requirementQueueService: RequirementQueueService,
  ) {}

  @Post()
  async createTask(
    @Body() requirement: RequirementRequestDto,
  ): Promise<RequirementResponseDto> {
    try {
      return await this.requirementTaskService.createRequirementTask(
        requirement,
      );
    } catch (error) {
      this.logger.error(`Error creating task: ${error.message}`, error.stack);
      throw new HttpException(
        `Failed to create requirement task: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get(':taskId')
  async getTaskStatus(@Param('taskId') taskId: string): Promise<TaskStatusDto> {
    try {
      return await this.requirementTaskService.getTaskStatus(taskId);
    } catch (error) {
      this.logger.error(
        `Error getting task status: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        `Failed to get task status: ${error.message}`,
        error.message.includes('not found')
          ? HttpStatus.NOT_FOUND
          : HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get()
  async listTasks(
    @Query('projectId') projectId?: string,
    @Query('status') status?: RequirementStatus,
  ): Promise<TaskStatusDto[]> {
    try {
      return await this.requirementTaskService.listTasks({
        projectId,
        status,
      });
    } catch (error) {
      this.logger.error(`Error listing tasks: ${error.message}`, error.stack);
      throw new HttpException(
        `Failed to list tasks: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('queue/stats')
  async getQueueStats(): Promise<QueueStatsDto> {
    try {
      return (await this.requirementQueueService.getQueueStats()) as QueueStatsDto;
    } catch (error) {
      this.logger.error(
        `Error getting queue stats: ${error.message}`,
        error.stack,
      );
      throw new HttpException(
        `Failed to get queue stats: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('queue/clean')
  async cleanQueue(
    @Body() body: { gracePeriod?: number },
  ): Promise<{ success: boolean; message: string }> {
    try {
      const gracePeriod = body.gracePeriod || 86400; // Default to 24 hours
      await this.requirementQueueService.cleanQueue(gracePeriod);
      return {
        success: true,
        message: `Queue cleaned successfully with grace period of ${gracePeriod} seconds`,
      };
    } catch (error) {
      this.logger.error(`Error cleaning queue: ${error.message}`, error.stack);
      throw new HttpException(
        `Failed to clean queue: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
