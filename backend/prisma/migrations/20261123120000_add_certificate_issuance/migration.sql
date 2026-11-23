-- CreateEnum
CREATE TYPE "certificate_status" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateTable
CREATE TABLE "certificate" (
    "id" UUID NOT NULL,
    "certificate_id" TEXT NOT NULL,
    "trainee_id" UUID NOT NULL,
    "course_id" TEXT NOT NULL,
    "trainee_name" TEXT NOT NULL,
    "course_title" TEXT NOT NULL,
    "days_completed" INTEGER NOT NULL,
    "completed_at" TIMESTAMPTZ NOT NULL,
    "issued_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "certificate_status" NOT NULL DEFAULT 'ACTIVE',
    "revoked_at" TIMESTAMPTZ,
    "signature" TEXT NOT NULL,
    "signature_algorithm" TEXT NOT NULL,
    "signature_version" TEXT NOT NULL,

    CONSTRAINT "certificate_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "certificate_days_completed_positive" CHECK ("days_completed" > 0),
    CONSTRAINT "certificate_revoked_at_consistent" CHECK (
        ("status" = 'ACTIVE' AND "revoked_at" IS NULL) OR
        ("status" = 'REVOKED' AND "revoked_at" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "certificate_certificate_id_key" ON "certificate"("certificate_id");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_trainee_id_course_id_key" ON "certificate"("trainee_id", "course_id");

-- CreateIndex
CREATE INDEX "certificate_status_idx" ON "certificate"("status");

-- AddForeignKey
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_trainee_id_fkey" FOREIGN KEY ("trainee_id") REFERENCES "trainee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "course"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
