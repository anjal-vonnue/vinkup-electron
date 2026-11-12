-- CreateTable
CREATE TABLE "desktop_auth_transaction" (
    "id" UUID NOT NULL,
    "state" TEXT NOT NULL,
    "code_challenge" TEXT NOT NULL,
    "code_challenge_method" TEXT NOT NULL,
    "loopback_redirect_uri" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "user_id" UUID,
    "user_email" TEXT,
    "user_name" TEXT,
    "user_role" TEXT,
    "error_code" TEXT,
    "handoff_code_hash" TEXT,
    "handoff_expires_at" TIMESTAMPTZ,
    "handoff_consumed_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "consumed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "desktop_auth_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "desktop_session" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "user_email" TEXT NOT NULL,
    "user_name" TEXT NOT NULL,
    "user_role" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "last_used_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "desktop_session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "desktop_auth_transaction_state_key" ON "desktop_auth_transaction"("state");

-- CreateIndex
CREATE UNIQUE INDEX "desktop_auth_transaction_handoff_code_hash_key" ON "desktop_auth_transaction"("handoff_code_hash");

-- CreateIndex
CREATE INDEX "desktop_auth_transaction_expires_at_idx" ON "desktop_auth_transaction"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "desktop_session_refresh_token_hash_key" ON "desktop_session"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "desktop_session_user_id_idx" ON "desktop_session"("user_id");

-- CreateIndex
CREATE INDEX "desktop_session_expires_at_idx" ON "desktop_session"("expires_at");
