ALTER TABLE "task_review"
ADD COLUMN "trainee_read_at" TIMESTAMPTZ;

-- Existing review comments predate unread tracking, so do not present them as new.
UPDATE "task_review"
SET "trainee_read_at" = "reviewed_at";

CREATE INDEX "task_review_trainee_id_trainee_read_at_reviewed_at_idx"
ON "task_review"("trainee_id", "trainee_read_at", "reviewed_at");
