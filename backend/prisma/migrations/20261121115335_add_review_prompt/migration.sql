-- CreateTable
CREATE TABLE "review_prompt" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "content" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "review_prompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_prompt_admin_id_idx" ON "review_prompt"("admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "review_prompt_admin_id_name_key" ON "review_prompt"("admin_id", "name");

-- AddForeignKey
ALTER TABLE "review_prompt" ADD CONSTRAINT "review_prompt_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
