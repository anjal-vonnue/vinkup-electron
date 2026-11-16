-- CreateEnum
CREATE TYPE "review_status" AS ENUM ('pending', 'approved', 'rework');

-- CreateEnum
CREATE TYPE "review_decision" AS ENUM ('approved', 'rework');

-- AlterTable
ALTER TABLE "task_progress" ADD COLUMN     "review_status" "review_status",
ADD COLUMN     "submission_count" INTEGER NOT NULL DEFAULT 0;

-- Backfill: tasks already submitted before reviews existed count as attempt 1.
-- review_status stays NULL on purpose: those submissions were never reviewed,
-- so admins can review them for the first time with this feature.
UPDATE "task_progress" SET "submission_count" = 1 WHERE "status" = 'completed';

-- CreateTable
CREATE TABLE "task_review" (
    "id" UUID NOT NULL,
    "trainee_id" UUID NOT NULL,
    "task_id" TEXT NOT NULL,
    "admin_id" UUID NOT NULL,
    "submission_no" INTEGER NOT NULL,
    "decision" "review_decision" NOT NULL,
    "feedback" TEXT NOT NULL DEFAULT '',
    "reviewed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "task_review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_review_trainee_id_task_id_reviewed_at_idx" ON "task_review"("trainee_id", "task_id", "reviewed_at");

-- CreateIndex
CREATE INDEX "task_review_trainee_id_reviewed_at_idx" ON "task_review"("trainee_id", "reviewed_at");

-- CreateIndex
CREATE UNIQUE INDEX "task_review_trainee_id_task_id_submission_no_key" ON "task_review"("trainee_id", "task_id", "submission_no");

-- AddForeignKey
ALTER TABLE "task_review" ADD CONSTRAINT "task_review_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "trainee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_review" ADD CONSTRAINT "task_review_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_review" ADD CONSTRAINT "task_review_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
