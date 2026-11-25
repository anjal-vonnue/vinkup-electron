-- AlterTable
ALTER TABLE "task_progress" ADD COLUMN     "timer_started_at" TIMESTAMPTZ,
ADD COLUMN     "total_time_seconds" INTEGER NOT NULL DEFAULT 0;
