-- CreateEnum
CREATE TYPE "slack_notification_status" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "slack_notification_outbox" (
    "id" UUID NOT NULL,
    "event_type" VARCHAR(64) NOT NULL,
    "channel_id" VARCHAR(32) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "slack_notification_status" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "next_retry_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processing_started_at" TIMESTAMPTZ,
    "sent_at" TIMESTAMPTZ,
    "last_error" TEXT,
    "dedupe_key" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "slack_notification_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slack_notification_outbox_dedupe_key_key" ON "slack_notification_outbox"("dedupe_key");

-- CreateIndex
CREATE INDEX "slack_notification_outbox_status_next_retry_at_idx" ON "slack_notification_outbox"("status", "next_retry_at");
