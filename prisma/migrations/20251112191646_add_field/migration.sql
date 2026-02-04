-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "marketData" JSONB,
ADD COLUMN     "reportType" TEXT NOT NULL DEFAULT 'crypto';

-- CreateIndex
CREATE INDEX "reports_userId_reportType_idx" ON "reports"("userId", "reportType");
