CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM (
    'low',
    'medium',
    'high'
);

-- CreateEnum
CREATE TYPE "CodeLanguage" AS ENUM (
    'typescript',
    'javascript',
    'python',
    'java',
    'csharp',
    'go',
    'ruby',
    'php'
);

-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'failed'
);

-- CreateTable
CREATE TABLE "requirement_tasks" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v1mc(),
    "project_id" TEXT NOT NULL,
    "repository_url" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "requirement_text" TEXT NOT NULL,
    "priority" "TaskPriority" NOT NULL DEFAULT 'medium',
    "additional_context" JSONB,
    "language" "CodeLanguage" NOT NULL DEFAULT 'typescript',
    "output_path" TEXT,
    "status" "RequirementStatus" NOT NULL DEFAULT 'pending',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "requirement_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "code_templates" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v1mc(),
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "templateContent" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "code_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quality_metrics" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v1mc(),
    "task_id" UUID NOT NULL,
    "code_quality_score" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "requirement_coverage_score" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "syntax_validity_score" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "static_analysis_results" JSONB,
    "feedback" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quality_metrics_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "quality_metrics" ADD CONSTRAINT "quality_metrics_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "requirement_tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
