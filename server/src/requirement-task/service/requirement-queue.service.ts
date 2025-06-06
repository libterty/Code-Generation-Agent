// src/requirement-task/service/requirement-queue.service.ts

import { TaskPriority } from '.prisma/client';

/**
 * 佇列任務狀態
 */
export interface TaskJobStatus {
  /**
   * 任務當前狀態
   */
  state: string;

  /**
   * 任務進度（如果有）
   */
  progress?: number;
}

/**
 * 佇列統計資訊
 */
export interface TaskQueueStatus {
  /**
   * 等待中的任務數量
   */
  waiting: number;

  /**
   * 正在處理的任務數量
   */
  active: number;

  /**
   * 已完成的任務數量
   */
  completed: number;

  /**
   * 失敗的任務數量
   */
  failed: number;

  /**
   * 延遲執行的任務數量
   */
  delayed: number;

  /**
   * 總任務數量
   */
  total: number;

  /**
   * 統計時間戳
   */
  timestamp: string;
}

/**
 * 需求佇列服務介面定義
 * 該介面定義了處理需求任務佇列的核心功能
 */
export interface RequirementQueueService {
  /**
   * 將任務添加到處理佇列中
   * @param taskId 任務ID
   * @param priority 任務優先級
   * @returns 任務在佇列中的ID
   */
  addTask(taskId: string, priority?: TaskPriority): Promise<string>;

  /**
   * 獲取任務在佇列中的狀態
   * @param jobId 任務ID
   * @returns 任務狀態資訊
   */
  getJobStatus(jobId: string): Promise<TaskJobStatus>;

  /**
   * 註冊任務處理函數
   * 當佇列中的任務完成時，會調用此處理函數
   * @param processorFn 處理函數，接收任務ID
   */
  registerTaskProcessor(processorFn: (taskId: string) => Promise<void>): void;

  /**
   * 獲取佇列統計資訊
   * @returns 佇列統計資訊
   */
  getQueueStats(): Promise<TaskQueueStatus>;

  /**
   * 清理佇列中的已完成和失敗任務
   * @param grace 清理前的等待時間（秒）
   */
  cleanQueue(grace?: number): Promise<void>;
}
