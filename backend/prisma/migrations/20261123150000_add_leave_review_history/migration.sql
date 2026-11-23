-- Append-only decision history. The leave_request row keeps its current/final
-- decision fields for existing API clients; this table preserves every review
-- (e.g. a Mentor approval followed by a Manager rejection).

-- CreateTable
CREATE TABLE "leave_review" (
    "id" UUID NOT NULL,
    "leave_request_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "reviewer_role" "staff_role" NOT NULL,
    "reviewer_name" TEXT NOT NULL,
    "decision" "leave_status" NOT NULL,
    "feedback" TEXT,
    "reviewed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_review_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_review_reviewer_name_not_blank" CHECK (length(btrim("reviewer_name")) > 0),
    CONSTRAINT "leave_review_decision_is_final" CHECK ("decision" IN ('APPROVED', 'REJECTED')),
    CONSTRAINT "leave_review_rejected_has_feedback" CHECK (
        "decision" <> 'REJECTED' OR length(btrim(COALESCE("feedback", ''))) > 0
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "leave_review_leave_request_id_reviewer_role_key"
    ON "leave_review"("leave_request_id", "reviewer_role");

-- CreateIndex
CREATE INDEX "leave_review_leave_request_id_reviewed_at_idx"
    ON "leave_review"("leave_request_id", "reviewed_at");

-- AddForeignKey
ALTER TABLE "leave_review" ADD CONSTRAINT "leave_review_leave_request_id_fkey"
    FOREIGN KEY ("leave_request_id") REFERENCES "leave_request"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Restrict rather than Cascade: a review must keep its reviewer even if the
-- staff account is removed later.
ALTER TABLE "leave_review" ADD CONSTRAINT "leave_review_reviewer_id_fkey"
    FOREIGN KEY ("reviewer_id") REFERENCES "admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill existing decisions from the single-review columns. No request can
-- have two reviews yet, so the unique (request, role) index is satisfied.
INSERT INTO "leave_review" (
    "id", "leave_request_id", "reviewer_id", "reviewer_role",
    "reviewer_name", "decision", "feedback", "reviewed_at", "created_at"
)
SELECT
    gen_random_uuid(),
    lr."id",
    lr."reviewer_id",
    lr."reviewer_role",
    COALESCE(NULLIF(btrim(COALESCE(lr."reviewer_name", '')), ''), a."name", 'Former reviewer'),
    lr."status",
    lr."feedback",
    lr."reviewed_at",
    COALESCE(lr."updated_at", lr."reviewed_at")
FROM "leave_request" AS lr
JOIN "admin" AS a ON a."id" = lr."reviewer_id"
WHERE lr."status" <> 'PENDING';

-- The old trigger made every decision final. Keep guarding decided rows, but
-- allow the one supported escalation: a Manager rejecting a Mentor approval.
CREATE OR REPLACE FUNCTION "leave_request_status_guard"() RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = NEW.status THEN
        IF OLD.status = 'PENDING' AND (
            NEW."reviewer_id" IS NOT NULL OR NEW."reviewer_role" IS NOT NULL OR
            NEW."reviewer_name" IS NOT NULL OR NEW."feedback" IS NOT NULL OR
            NEW."reviewed_at" IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'A pending leave request cannot have review details';
        END IF;
        IF OLD.status <> 'PENDING' AND (
            NEW."reviewer_id" IS DISTINCT FROM OLD."reviewer_id" OR
            NEW."reviewer_role" IS DISTINCT FROM OLD."reviewer_role" OR
            NEW."reviewer_name" IS DISTINCT FROM OLD."reviewer_name" OR
            NEW."feedback" IS DISTINCT FROM OLD."feedback" OR
            NEW."reviewed_at" IS DISTINCT FROM OLD."reviewed_at"
        ) THEN
            RAISE EXCEPTION 'A reviewed leave request cannot change its decision';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status = 'PENDING' AND NEW.status IN ('APPROVED', 'REJECTED') THEN
        RETURN NEW;
    END IF;

    IF OLD.status = 'APPROVED' AND NEW.status = 'REJECTED'
        AND OLD."reviewer_role" = 'MENTOR' AND NEW."reviewer_role" = 'MANAGER' THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Invalid leave request status transition';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER "leave_request_status_guard" ON "leave_request";

CREATE TRIGGER "leave_request_status_guard"
    BEFORE UPDATE ON "leave_request"
    FOR EACH ROW EXECUTE FUNCTION "leave_request_status_guard"();
