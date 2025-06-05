import { TaskPriority, CodeLanguage, RequirementStatus } from '.prisma/client';
import { Transform } from 'class-transformer';

export class RequirementRequestDto {
  projectId: string;
  repositoryUrl: string;
  branch: string;
  requirementText: string;
  @Transform(({ value }) => value ? value : TaskPriority.medium)
  priority?: TaskPriority
  additionalContext?: Record<string, any>;
  @Transform(({ value }) => value ? value : CodeLanguage.typescript)
  language?: CodeLanguage;
  outputPath?: string;
  templateId?: string;
}

export class RequirementResponseDto {
  taskId: string;
  status: RequirementStatus;
  message: string;
}

export class TaskStatusDto {
  taskId: string;
  status: RequirementStatus;
  progress: number;
  details?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  queueInfo: {
    state: string;
    progress?: number;
  }
  qualityMetrics?: {
    codeQualityScore: number;
    requirementCoverageScore: number;
    syntaxValidityScore: number;
  }[];
}

export class QueueStatsDto {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  total: number;
  timestamp: string;
}

export class QueryRequirementTaskDto {
  projectId?: string;
  status?: RequirementStatus
}

export class UpdateTaskStatusDto {
    taskId: string;
    status: RequirementStatus;
    progress: number;
    details: Record<string, any> 
}

export class UpdateTaskQualityMetricsDto {
  taskId: string;
  codeQualityScore: number;
  requirementCoverageScore: number;
  syntaxValidityScore: number;
  staticAnalysisResults?: Record<string, any>;
  feedback?: string
}