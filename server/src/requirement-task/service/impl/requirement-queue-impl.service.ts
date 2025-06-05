// src/requirement-task/services/requirement-queue.service.ts

import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { Queue, Worker, Job } from 'bullmq';
import { Cluster as RedisCluster } from 'ioredis';
import { TaskPriority } from '.prisma/client'
import { TaskJobStatus, TaskQueueStatus, RequirementQueueService } from '@server/requirement-task/service/requirement-queue.service';
import { REDIS_REPOSITORY } from '@server/constants';

@Injectable()
export class RequirementQueueServiceImpl implements OnModuleInit, RequirementQueueService {
  private readonly logger = new Logger(RequirementQueueServiceImpl.name);
  private requirementQueue: Queue;
  private worker: Worker;

  constructor(
    @Inject(REDIS_REPOSITORY)
    private readonly redisRepository: RedisCluster,
  ) {}

  public async onModuleInit() {
    this.logger.log('Initializing Requirement Queue Service');
    
    // Initialize BullMQ Queue with the Redis connection
    this.requirementQueue = new Queue('requirement-processing', {
      connection: this.redisRepository,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: false, // Keep completed jobs for tracking
        removeOnFail: false, // Keep failed jobs for debugging
      }
    });

    // Initialize worker for processing tasks
    this.worker = new Worker(
      'requirement-processing', 
      async (job: Job) => {
        // The worker will emit an event that the processor function will handle
        this.logger.log(`Processing job ${job.id} for task ${job.data.taskId}`);
        return job.data; // Return the data to be handled by the processor
      },
      {
        connection: this.redisRepository,
        concurrency: parseInt(process.env.MAX_CONCURRENT_TASKS || '5'),
        autorun: true
      }
    );

    // Set up event handlers for the worker
    this.worker.on('completed', job => {
      this.logger.log(`Job ${job.id} completed successfully`);
    });

    this.worker.on('failed', (job, err) => {
      this.logger.error(`Job ${job?.id} failed with error: ${err.message}`);
    });
    
    this.worker.on('active', job => {
      this.logger.log(`Job ${job.id} has started processing`);
    });
    
    this.worker.on('stalled', jobId => {
      this.logger.warn(`Job ${jobId} has been stalled`);
    });
    
    this.logger.log('Requirement Queue Service initialized');
  }

  /**
   * Add a requirement task to the processing queue
   * @param taskId The ID of the task to process
   * @param priority Priority level for the task
   * @returns Job ID
   */
  public async addTask(taskId: string, priority: TaskPriority = TaskPriority.medium): Promise<string> {
    const job = await this.requirementQueue.add(
      'process-requirement', 
      { taskId }, 
      { 
        priority: this.getPriorityValue(priority),
        jobId: taskId, // Use the task ID as the job ID for easier tracking
      }
    );
    
    this.logger.log(`Task ${taskId} added to queue with job ID: ${job.id}`);
    return job.id;
  }

  /**
   * Get the status of a job in the queue
   * @param jobId The ID of the job
   * @returns Job status and details
   */
  public async getJobStatus(jobId: string): Promise<TaskJobStatus> {
    const job = await this.requirementQueue.getJob(jobId);
    
    if (!job) {
      return { state: 'not-found', progress: undefined };
    }
    
    const state = await job.getState();
    return { 
      state, 
      progress: job.progress
    };
  }

  /**
   * Register a processor function to handle completed jobs
   * @param processorFn The function to process tasks
   */
  public registerTaskProcessor(processorFn: (taskId: string) => Promise<void>): void {
    this.worker.on('completed', async (job) => {
      try {
        await processorFn(job.data.taskId);
      } catch (error) {
        this.logger.error(`Error in task processor for task ${job.data.taskId}: ${error.message}`);
      }
    });
    
    this.logger.log('Task processor registered');
  }

  /**
   * Get statistics about the queue
   * @returns Queue statistics
   */
  public async getQueueStats(): Promise<TaskQueueStatus> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.requirementQueue.getWaitingCount(),
      this.requirementQueue.getActiveCount(),
      this.requirementQueue.getCompletedCount(),
      this.requirementQueue.getFailedCount(),
      this.requirementQueue.getDelayedCount()
    ]);
    
    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + completed + failed + delayed,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Clean the queue by removing completed and failed jobs
   * @param grace Grace period in seconds before removal (default: 24 hours)
   */
  public async cleanQueue(grace: number = 86400): Promise<void> {
    // 0 = completed, 1 = waiting, 2 = active, 3 = delayed, 4 = failed, 5 = paused (see BullMQ Queue.CleanStatus)
    await this.requirementQueue.clean(grace * 1000, 0); // completed
    await this.requirementQueue.clean(grace * 1000, 4); // failed
    this.logger.log(`Queue cleaned with grace period of ${grace} seconds`);
  }

  /**
   * Convert priority string to numeric value for queue
   * @param priority Priority level
   * @private
   */
  private getPriorityValue(priority: TaskPriority): number {
    const priorities = {
      [TaskPriority.critical]: 1,
      [TaskPriority.high]: 2,
      [TaskPriority.medium]: 3,
      [TaskPriority.low]: 4,
    };
    
    return priorities[priority] || 3;
  }
}