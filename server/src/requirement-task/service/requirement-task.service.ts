import { 
  RequirementRequestDto, 
  RequirementResponseDto, 
  QueryRequirementTaskDto,
  UpdateTaskStatusDto,
  UpdateTaskQualityMetricsDto,
  TaskStatusDto,  
} from '@server/requirement-task/dto/requirement-task.dto';

export interface RequirementTaskService {
  createRequirementTask(requirement: RequirementRequestDto): Promise<RequirementResponseDto>;
  getTaskStatus(taskId: string): Promise<TaskStatusDto>;
  listTasks(dto: QueryRequirementTaskDto): Promise<TaskStatusDto[]>;
  updateTaskStatus(dto: UpdateTaskStatusDto): Promise<void>;
  updateTaskQualityMetrics(dto: UpdateTaskQualityMetricsDto): Promise<void>;
}