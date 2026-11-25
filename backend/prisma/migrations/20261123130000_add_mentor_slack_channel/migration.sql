-- Add mentor-configured Slack channel for task submission notifications.
-- Nullable: mentors without a configured channel simply do not receive Slack notifications.
ALTER TABLE "admin"
ADD COLUMN "slack_channel_id" VARCHAR(32);
