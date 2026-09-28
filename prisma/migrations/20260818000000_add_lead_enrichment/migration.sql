-- AlterTable
ALTER TABLE "leads" ADD COLUMN "enrichment_status" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "leads" ADD COLUMN "enrichment_snapshot" JSONB;
ALTER TABLE "leads" ADD COLUMN "enriched_at" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "idx_leads_enrichment_status" ON "leads"("enrichment_status");

-- CreateIndex
CREATE INDEX "idx_leads_user_id_enrichment_status" ON "leads"("user_id", "enrichment_status");
