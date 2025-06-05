import { registerAs } from '@nestjs/config';

export type TaskQueueConfig = {
  rabbitmqUri: string;
  maxConcurrentTasks: number;
};

export const taskQueueConfig = registerAs<TaskQueueConfig>('taskQueue', () => ({
  rabbitmqUri: process.env.RABBITMQ_URI,
  maxConcurrentTasks: parseInt(process.env.MAX_CONCURRENT_TASKS || '10', 10),
}));
