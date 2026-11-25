-- Extend the leave request status guard so a Manager can also review a request
-- that a Mentor rejected: either override it to APPROVED or record their own
-- REJECTED decision. Both decisions stay in the append-only leave_review table;
-- only the row snapshot of the current/final decision changes here. No data is
-- modified and no rows are deleted by this migration.

CREATE OR REPLACE FUNCTION "leave_request_status_guard"() RETURNS TRIGGER AS $$
DECLARE
    -- A Manager decision that replaces a decision currently recorded by a Mentor.
    manager_reviewing_mentor_decision BOOLEAN :=
        OLD."reviewer_role" = 'MENTOR' AND NEW."reviewer_role" = 'MANAGER';
BEGIN
    IF OLD.status = NEW.status THEN
        IF OLD.status = 'PENDING' AND (
            NEW."reviewer_id" IS NOT NULL OR NEW."reviewer_role" IS NOT NULL OR
            NEW."reviewer_name" IS NOT NULL OR NEW."feedback" IS NOT NULL OR
            NEW."reviewed_at" IS NOT NULL
        ) THEN
            RAISE EXCEPTION 'A pending leave request cannot have review details';
        END IF;
        -- A Manager re-rejecting a Mentor rejection keeps REJECTED but replaces
        -- the current-decision snapshot, so allow that one review-field change
        -- only when the decision actually moves to a different reviewer.
        IF OLD.status <> 'PENDING'
            AND NOT (
                OLD.status = 'REJECTED'
                AND manager_reviewing_mentor_decision
                AND NEW."reviewer_id" IS DISTINCT FROM OLD."reviewer_id"
            )
            AND (
                NEW."reviewer_id" IS DISTINCT FROM OLD."reviewer_id" OR
                NEW."reviewer_role" IS DISTINCT FROM OLD."reviewer_role" OR
                NEW."reviewer_name" IS DISTINCT FROM OLD."reviewer_name" OR
                NEW."feedback" IS DISTINCT FROM OLD."feedback" OR
                NEW."reviewed_at" IS DISTINCT FROM OLD."reviewed_at"
            )
        THEN
            RAISE EXCEPTION 'A reviewed leave request cannot change its decision';
        END IF;
        RETURN NEW;
    END IF;

    IF OLD.status = 'PENDING' AND NEW.status IN ('APPROVED', 'REJECTED') THEN
        RETURN NEW;
    END IF;

    -- Mentor approval -> Manager rejection (existing behaviour).
    IF OLD.status = 'APPROVED' AND NEW.status = 'REJECTED'
        AND manager_reviewing_mentor_decision THEN
        RETURN NEW;
    END IF;

    -- Mentor rejection -> Manager approval (new override).
    IF OLD.status = 'REJECTED' AND NEW.status = 'APPROVED'
        AND manager_reviewing_mentor_decision THEN
        RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Invalid leave request status transition';
END;
$$ LANGUAGE plpgsql;
