/*
  Warnings:

  - You are about to drop the column `timer_started_at` on the `task_progress` table. All the data in the column will be lost.
  - You are about to drop the column `total_time_seconds` on the `task_progress` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "task_progress" DROP COLUMN "timer_started_at",
DROP COLUMN "total_time_seconds";
