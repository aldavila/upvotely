-- CreateTable
CREATE TABLE "conversation_feedback" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "agentId" TEXT,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "context" JSONB,
    "metadata" JSONB,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_feedback_organizationId_agentId_createdAt_idx" ON "conversation_feedback"("organizationId", "agentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "conversation_feedback_organizationId_rating_idx" ON "conversation_feedback"("organizationId", "rating");

-- CreateIndex
CREATE INDEX "conversation_feedback_organizationId_sessionId_idx" ON "conversation_feedback"("organizationId", "sessionId");

-- AddForeignKey
ALTER TABLE "conversation_feedback" ADD CONSTRAINT "conversation_feedback_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
