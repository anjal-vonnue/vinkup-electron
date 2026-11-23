-- Grading writes awarded_marks/feedback to checkpoint_answer after the attempt is
-- submitted. The original answer guard rejected every write on a submitted
-- attempt, so replace it with one that only blocks changes to the trainee's
-- answer payload. Autosave late writes are still rejected by the database.
CREATE OR REPLACE FUNCTION "checkpoint_answer_guard"() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NOT EXISTS (
            SELECT 1 FROM "checkpoint_attempt"
            WHERE "id" = NEW."attempt_id" AND "status" = 'IN_PROGRESS'
        ) THEN
            RAISE EXCEPTION 'Attempt is finalized; answers can no longer be changed';
        END IF;
    ELSE
        IF (
            NEW."answer_text" IS DISTINCT FROM OLD."answer_text" OR
            NEW."selected_option" IS DISTINCT FROM OLD."selected_option" OR
            NEW."file_name" IS DISTINCT FROM OLD."file_name" OR
            NEW."file_mime_type" IS DISTINCT FROM OLD."file_mime_type" OR
            NEW."file_size" IS DISTINCT FROM OLD."file_size" OR
            NEW."file_data" IS DISTINCT FROM OLD."file_data" OR
            NEW."client_revision" IS DISTINCT FROM OLD."client_revision" OR
            NEW."saved_at" IS DISTINCT FROM OLD."saved_at"
        ) AND NOT EXISTS (
            SELECT 1 FROM "checkpoint_attempt"
            WHERE "id" = NEW."attempt_id" AND "status" = 'IN_PROGRESS'
        ) THEN
            RAISE EXCEPTION 'Attempt is finalized; answers can no longer be changed';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
