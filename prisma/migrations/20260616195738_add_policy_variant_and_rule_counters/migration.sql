-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'project',
    "priority" REAL NOT NULL DEFAULT 1.0,
    "type" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "suggestion" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'typescript',
    "fileExtensions" TEXT,
    "tags" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'medium',
    "source" TEXT NOT NULL DEFAULT 'auto',
    "category" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "matchCount" INTEGER NOT NULL DEFAULT 0,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "falsePositiveCount" INTEGER NOT NULL DEFAULT 0,
    "adoptedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "lastUsedAt" DATETIME,
    "immunityUntil" DATETIME,
    "archivedAt" DATETIME,
    "expiresAt" DATETIME,
    "renewCount" INTEGER NOT NULL DEFAULT 0,
    "shadowUntil" DATETIME
);

-- CreateTable
CREATE TABLE "DiffLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT,
    "filePath" TEXT NOT NULL,
    "fileExtension" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "projectId" TEXT,
    "originalHash" TEXT NOT NULL,
    "modifiedHash" TEXT NOT NULL,
    "diffContent" TEXT NOT NULL,
    "astStatus" TEXT,
    "diffType" TEXT NOT NULL,
    "operations" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiffLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConflictRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleAId" TEXT NOT NULL,
    "ruleBId" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "resolution" TEXT,
    "batchChoice" TEXT,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConflictRecord_ruleAId_fkey" FOREIGN KEY ("ruleAId") REFERENCES "Rule" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ConflictRecord_ruleBId_fkey" FOREIGN KEY ("ruleBId") REFERENCES "Rule" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MetricEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eventType" TEXT NOT NULL,
    "properties" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AppConfig" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "mode" TEXT NOT NULL DEFAULT 'silent',
    "data" TEXT
);

-- CreateTable
CREATE TABLE "RuleVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "suggestion" TEXT,
    "editedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RuleVersion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "contextHash" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "nodeIds" TEXT NOT NULL,
    "proposedBy" TEXT,
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ApprovalRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposalId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'PENDING',
    "contextHash" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "payload" TEXT,
    "configJson" TEXT NOT NULL,
    "votesJson" TEXT NOT NULL,
    "assignedTo" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "resolvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApprovalRequest_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PolicyVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "basePolicyId" TEXT NOT NULL,
    "variant" TEXT NOT NULL,
    "overrides" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PolicyVariant_basePolicyId_fkey" FOREIGN KEY ("basePolicyId") REFERENCES "Rule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShadowLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "matchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wouldBlock" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ShadowLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Rule_archivedAt_idx" ON "Rule"("archivedAt");

-- CreateIndex
CREATE INDEX "Rule_shadowUntil_idx" ON "Rule"("shadowUntil");

-- CreateIndex
CREATE INDEX "Proposal_status_idx" ON "Proposal"("status");

-- CreateIndex
CREATE INDEX "Proposal_expiresAt_idx" ON "Proposal"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_contextHash_status_key" ON "Proposal"("contextHash", "status");

-- CreateIndex
CREATE INDEX "ApprovalRequest_stage_idx" ON "ApprovalRequest"("stage");

-- CreateIndex
CREATE INDEX "ApprovalRequest_assignedTo_idx" ON "ApprovalRequest"("assignedTo");

-- CreateIndex
CREATE INDEX "ApprovalRequest_expiresAt_idx" ON "ApprovalRequest"("expiresAt");

-- CreateIndex
CREATE INDEX "PolicyVariant_basePolicyId_idx" ON "PolicyVariant"("basePolicyId");

-- CreateIndex
CREATE INDEX "PolicyVariant_variant_idx" ON "PolicyVariant"("variant");

-- CreateIndex
CREATE INDEX "ShadowLog_ruleId_idx" ON "ShadowLog"("ruleId");

-- CreateIndex
CREATE INDEX "ShadowLog_matchedAt_idx" ON "ShadowLog"("matchedAt");
