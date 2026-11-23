-- CreateEnum
CREATE TYPE "leave_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "leave_request" (
    "id" UUID NOT NULL,
    "trainee_id" UUID NOT NULL,
    "subject" VARCHAR(200) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "leave_status" NOT NULL DEFAULT 'PENDING',
    "reviewer_id" UUID,
    "reviewer_role" "staff_role",
    "reviewer_name" TEXT,
    "feedback" TEXT,
    "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "leave_request_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_request_subject_not_blank" CHECK (length(btrim("subject")) > 0),
    CONSTRAINT "leave_request_reason_not_blank" CHECK (length(btrim("reason")) > 0),
    CONSTRAINT "leave_request_pending_unreviewed" CHECK (
        "status" <> 'PENDING' OR (
            "reviewer_id" IS NULL AND
            "reviewer_role" IS NULL AND
            "reviewer_name" IS NULL AND
            "feedback" IS NULL AND
            "reviewed_at" IS NULL
        )
    ),
    CONSTRAINT "leave_request_decided_has_reviewer" CHECK (
        "status" = 'PENDING' OR (
            "reviewer_id" IS NOT NULL AND
            "reviewer_role" IS NOT NULL AND
            "reviewed_at" IS NOT NULL
        )
    ),
    CONSTRAINT "leave_request_rejected_has_feedback" CHECK (
        "status" <> 'REJECTED' OR length(btrim(COALESCE("feedback", ''))) > 0
    )
);

-- CreateIndex
CREATE INDEX "leave_request_trainee_id_submitted_at_idx" ON "leave_request"("trainee_id", "submitted_at");

-- CreateIndex
CREATE INDEX "leave_request_status_submitted_at_idx" ON "leave_request"("status", "submitted_at");

-- AddForeignKey
-- Restrict rather than Cascade: historical leave requests outlive account removal.
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "trainee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A decision is final. The API also uses a conditional UPDATE, but this trigger
-- protects the record from any later code path that tries to change a decided status.
CREATE FUNCTION "leave_request_status_guard"() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status <> 'PENDING' AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'A reviewed leave request cannot change status';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "leave_request_status_guard"
    BEFORE UPDATE OF "status" ON "leave_request"
    FOR EACH ROW EXECUTE FUNCTION "leave_request_status_guard"();
