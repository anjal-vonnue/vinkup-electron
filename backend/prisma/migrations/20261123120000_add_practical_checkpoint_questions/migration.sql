-- Practical checkpoint questions run a workspace like a daily task: starter files,
-- package installation, a terminal and an optional Run command.
ALTER TYPE "checkpoint_question_type" ADD VALUE 'PRACTICAL';

ALTER TABLE "checkpoint_question"
  ADD COLUMN "runtime" TEXT,
  ADD COLUMN "run_command" TEXT,
  ADD COLUMN "setup_sql" TEXT,
  ADD COLUMN "starter_files" JSONB;

ALTER TABLE "checkpoint_answer"
  ADD COLUMN "workspace_files" JSONB;
