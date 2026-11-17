-- Trainee accounts can be deactivated by a manager without deleting their records.
ALTER TABLE "trainee" ADD COLUMN "is_active" BOOLEAN NOT NULL DEFAULT true;
