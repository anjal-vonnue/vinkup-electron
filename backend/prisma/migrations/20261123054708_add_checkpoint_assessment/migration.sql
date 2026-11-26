-- CreateEnum
CREATE TYPE "checkpoint_status" AS ENUM ('DRAFT', 'SCHEDULED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "checkpoint_question_type" AS ENUM ('TEXT', 'LONG_TEXT', 'CODE', 'SQL', 'MULTIPLE_CHOICE', 'FILE');

-- CreateEnum
CREATE TYPE "checkpoint_result_visibility" AS ENUM ('IMMEDIATE', 'AFTER_APPROVAL');

-- CreateEnum
CREATE TYPE "checkpoint_attempt_status" AS ENUM ('IN_PROGRESS', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "checkpoint_submission_reason" AS ENUM ('MANUAL', 'TIME_EXPIRED', 'CANCELLED');

-- CreateTable
CREATE TABLE "checkpoint" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "source_file_name" TEXT,
    "source_markdown" TEXT NOT NULL,
    "instructions_markdown" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "total_marks" INTEGER NOT NULL,
    "passing_marks" INTEGER NOT NULL,
    "start_at" TIMESTAMPTZ,
    "status" "checkpoint_status" NOT NULL DEFAULT 'DRAFT',
    "max_attempts" INTEGER NOT NULL DEFAULT 1,
    "allow_early_submission" BOOLEAN NOT NULL DEFAULT true,
    "allow_late_entry" BOOLEAN NOT NULL DEFAULT true,
    "result_visibility" "checkpoint_result_visibility" NOT NULL DEFAULT 'AFTER_APPROVAL',
    "results_published_at" TIMESTAMPTZ,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "checkpoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkpoint_question" (
    "id" UUID NOT NULL,
    "checkpoint_id" UUID NOT NULL,
    "order_index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "prompt_markdown" TEXT NOT NULL,
    "type" "checkpoint_question_type" NOT NULL,
    "marks" INTEGER NOT NULL,
    "options" JSONB,
    "correct_option" TEXT,
    "code_language" TEXT,

    CONSTRAINT "checkpoint_question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainee_group" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainee_group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainee_group_member" (
    "group_id" UUID NOT NULL,
    "trainee_id" UUID NOT NULL,

    CONSTRAINT "trainee_group_member_pkey" PRIMARY KEY ("group_id","trainee_id")
);

-- CreateTable
CREATE TABLE "checkpoint_assignment" (
    "id" UUID NOT NULL,
    "checkpoint_id" UUID NOT NULL,
    "trainee_id" UUID,
    "group_id" UUID,

    CONSTRAINT "checkpoint_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkpoint_attempt" (
    "id" UUID NOT NULL,
    "checkpoint_id" UUID NOT NULL,
    "trainee_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL DEFAULT 1,
    "status" "checkpoint_attempt_status" NOT NULL DEFAULT 'IN_PROGRESS',
    "session_token" TEXT NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL,
    "deadline_at" TIMESTAMPTZ NOT NULL,
    "submitted_at" TIMESTAMPTZ,
    "submission_reason" "checkpoint_submission_reason",
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_score" DOUBLE PRECISION,
    "feedback" TEXT,
    "graded_by_id" UUID,
    "graded_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "checkpoint_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkpoint_answer" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "answer_text" TEXT,
    "selected_option" TEXT,
    "file_name" TEXT,
    "file_mime_type" TEXT,
    "file_size" INTEGER,
    "file_data" TEXT,
    "client_revision" INTEGER NOT NULL DEFAULT 0,
    "awarded_marks" DOUBLE PRECISION,
    "feedback" TEXT,
    "saved_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "checkpoint_answer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkpoint_attempt_event" (
    "id" UUID NOT NULL,
    "attempt_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkpoint_attempt_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "checkpoint_status_start_at_idx" ON "checkpoint"("status", "start_at");

-- CreateIndex
CREATE INDEX "checkpoint_question_checkpoint_id_idx" ON "checkpoint_question"("checkpoint_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkpoint_question_checkpoint_id_order_index_key" ON "checkpoint_question"("checkpoint_id", "order_index");

-- CreateIndex
CREATE UNIQUE INDEX "trainee_group_created_by_id_name_key" ON "trainee_group"("created_by_id", "name");

-- CreateIndex
CREATE INDEX "trainee_group_member_trainee_id_idx" ON "trainee_group_member"("trainee_id");

-- CreateIndex
CREATE INDEX "checkpoint_assignment_checkpoint_id_idx" ON "checkpoint_assignment"("checkpoint_id");

-- CreateIndex
CREATE INDEX "checkpoint_assignment_trainee_id_idx" ON "checkpoint_assignment"("trainee_id");

-- CreateIndex
CREATE INDEX "checkpoint_assignment_group_id_idx" ON "checkpoint_assignment"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkpoint_attempt_session_token_key" ON "checkpoint_attempt"("session_token");

-- CreateIndex
CREATE INDEX "checkpoint_attempt_status_deadline_at_idx" ON "checkpoint_attempt"("status", "deadline_at");

-- CreateIndex
CREATE INDEX "checkpoint_attempt_trainee_id_status_idx" ON "checkpoint_attempt"("trainee_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "checkpoint_attempt_checkpoint_id_trainee_id_attempt_number_key" ON "checkpoint_attempt"("checkpoint_id", "trainee_id", "attempt_number");

-- CreateIndex
CREATE INDEX "checkpoint_answer_attempt_id_idx" ON "checkpoint_answer"("attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkpoint_answer_attempt_id_question_id_key" ON "checkpoint_answer"("attempt_id", "question_id");

-- CreateIndex
CREATE INDEX "checkpoint_attempt_event_attempt_id_created_at_idx" ON "checkpoint_attempt_event"("attempt_id", "created_at");

-- AddForeignKey
ALTER TABLE "checkpoint" ADD CONSTRAINT "checkpoint_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_question" ADD CONSTRAINT "checkpoint_question_checkpoint_id_fkey" FOREIGN KEY ("checkpoint_id") REFERENCES "checkpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainee_group" ADD CONSTRAINT "trainee_group_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainee_group_member" ADD CONSTRAINT "trainee_group_member_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "trainee_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainee_group_member" ADD CONSTRAINT "trainee_group_member_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "trainee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_assignment" ADD CONSTRAINT "checkpoint_assignment_checkpoint_id_fkey" FOREIGN KEY ("checkpoint_id") REFERENCES "checkpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_assignment" ADD CONSTRAINT "checkpoint_assignment_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "trainee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_assignment" ADD CONSTRAINT "checkpoint_assignment_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "trainee_group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_attempt" ADD CONSTRAINT "checkpoint_attempt_checkpoint_id_fkey" FOREIGN KEY ("checkpoint_id") REFERENCES "checkpoint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_attempt" ADD CONSTRAINT "checkpoint_attempt_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "trainee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_attempt" ADD CONSTRAINT "checkpoint_attempt_graded_by_id_fkey" FOREIGN KEY ("graded_by_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_answer" ADD CONSTRAINT "checkpoint_answer_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "checkpoint_attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_answer" ADD CONSTRAINT "checkpoint_answer_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "checkpoint_question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_attempt_event" ADD CONSTRAINT "checkpoint_attempt_event_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "checkpoint_attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A checkpoint must have a positive duration and a marks split that makes sense.
ALTER TABLE "checkpoint" ADD CONSTRAINT "checkpoint_duration_positive" CHECK ("duration_minutes" > 0);
ALTER TABLE "checkpoint" ADD CONSTRAINT "checkpoint_marks_valid" CHECK (
    "total_marks" > 0 AND "passing_marks" > 0 AND "passing_marks" <= "total_marks"
);
ALTER TABLE "checkpoint" ADD CONSTRAINT "checkpoint_max_attempts_valid" CHECK ("max_attempts" > 0);

-- An assignment targets exactly one trainee or one group.
ALTER TABLE "checkpoint_assignment" ADD CONSTRAINT "checkpoint_assignment_one_target" CHECK (
    (("trainee_id" IS NOT NULL)::int + ("group_id" IS NOT NULL)::int) = 1
);

-- One active attempt per trainee. PostgreSQL treats NULLs as distinct in a
-- normal unique index, so this partial index is the real single-session guard.
CREATE UNIQUE INDEX "checkpoint_attempt_one_active_per_trainee"
    ON "checkpoint_attempt"("trainee_id")
    WHERE "status" = 'IN_PROGRESS';

-- A scheduled start is required once a checkpoint leaves DRAFT.
ALTER TABLE "checkpoint" ADD CONSTRAINT "checkpoint_scheduled_has_start" CHECK (
    "status" = 'DRAFT' OR "start_at" IS NOT NULL
);

ALTER TABLE "checkpoint_attempt" ADD CONSTRAINT "checkpoint_attempt_deadline_after_start" CHECK (
    "deadline_at" > "started_at"
);
ALTER TABLE "checkpoint_attempt" ADD CONSTRAINT "checkpoint_attempt_finalized_consistent" CHECK (
    ("status" = 'IN_PROGRESS' AND "submitted_at" IS NULL AND "submission_reason" IS NULL)
    OR
    ("status" = 'SUBMITTED' AND "submitted_at" IS NOT NULL AND "submission_reason" IS NOT NULL)
);

-- Answers can only be written while their attempt is in progress. This is the
-- database-side backstop for the API's deadline checks.
CREATE FUNCTION "checkpoint_answer_guard"() RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM "checkpoint_attempt"
        WHERE "id" = NEW."attempt_id" AND "status" = 'IN_PROGRESS'
    ) THEN
        RAISE EXCEPTION 'Attempt is finalized; answers can no longer be changed';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "checkpoint_answer_guard"
    BEFORE INSERT OR UPDATE ON "checkpoint_answer"
    FOR EACH ROW EXECUTE FUNCTION "checkpoint_answer_guard"();

-- A finalized attempt is terminal.
CREATE FUNCTION "checkpoint_attempt_status_guard"() RETURNS TRIGGER AS $$
BEGIN
    IF OLD."status" = 'SUBMITTED' AND NEW."status" IS DISTINCT FROM OLD."status" THEN
        RAISE EXCEPTION 'A finalized checkpoint attempt cannot change status';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "checkpoint_attempt_status_guard"
    BEFORE UPDATE OF "status" ON "checkpoint_attempt"
    FOR EACH ROW EXECUTE FUNCTION "checkpoint_attempt_status_guard"();
