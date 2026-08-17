-- CreateEnum
CREATE TYPE "EnrichmentStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'ENRICHED', 'PARTIALLY_ENRICHED', 'ENRICHMENT_FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "search_results" ADD COLUMN "enrichment_status" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "search_results" ADD COLUMN "enrichment_snapshot" JSONB;
ALTER TABLE "search_results" ADD COLUMN "enriched_at" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "idx_search_results_enrichment_status" ON "search_results"("enrichment_status");

-- CreateIndex
CREATE INDEX "idx_search_results_execution_enrichment" ON "search_results"("execution_id", "enrichment_status");
