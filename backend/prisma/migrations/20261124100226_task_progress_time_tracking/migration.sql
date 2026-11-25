-- AlterTable
ALTER TABLE "task_progress" ADD COLUMN     "last_heartbeat_at" TIMESTAMPTZ,
ADD COLUMN     "time_spent_seconds" INTEGER NOT NULL DEFAULT 0;
