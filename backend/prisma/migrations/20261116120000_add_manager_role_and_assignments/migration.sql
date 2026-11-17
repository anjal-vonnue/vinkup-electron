-- CreateEnum
CREATE TYPE "staff_role" AS ENUM ('MENTOR', 'MANAGER');

-- AlterTable
ALTER TABLE "admin" ADD COLUMN "role" "staff_role" NOT NULL DEFAULT 'MENTOR';

-- Existing admin accounts are mentor/reviewer accounts in the current hierarchy.
UPDATE "admin" SET "role" = 'MENTOR' WHERE "role" IS NULL OR "role" = 'MENTOR';

-- AlterTable
ALTER TABLE "trainee" ADD COLUMN "mentor_id" UUID;

-- CreateIndex
CREATE INDEX "trainee_mentor_id_idx" ON "trainee"("mentor_id");

-- AddForeignKey
ALTER TABLE "trainee" ADD CONSTRAINT "trainee_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
