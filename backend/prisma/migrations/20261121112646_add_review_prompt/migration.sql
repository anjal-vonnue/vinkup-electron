-- CreateTable
CREATE TABLE "review_prompt" (
    "id" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "review_prompt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "review_prompt_adminId_idx" ON "review_prompt"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "review_prompt_adminId_name_key" ON "review_prompt"("adminId", "name");

-- AddForeignKey
ALTER TABLE "review_prompt" ADD CONSTRAINT "review_prompt_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
