-- CreateEnum
CREATE TYPE "checkpoint_mode" AS ENUM ('MCQ', 'PRACTICAL');

-- AlterTable
ALTER TABLE "checkpoint" ADD COLUMN     "mode" "checkpoint_mode" NOT NULL DEFAULT 'MCQ';
