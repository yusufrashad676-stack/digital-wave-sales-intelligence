-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'REVIEWED', 'CONTACTED', 'QUALIFIED', 'DISQUALIFIED');

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "notes" VARCHAR(4000),
    "provider_id" VARCHAR(64) NOT NULL,
    "provider_record_id" VARCHAR(512) NOT NULL,
    "company_name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(128),
    "formatted_address" VARCHAR(1024),
    "area" VARCHAR(255),
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "phone" VARCHAR(64),
    "email" VARCHAR(320),
    "website_domain" VARCHAR(255),
    "rating" DOUBLE PRECISION,
    "rating_count" INTEGER,
    "source_url" VARCHAR(2048),
    "verification_status" "SearchResultVerificationStatus" NOT NULL DEFAULT 'UNKNOWN',
    "retrieved_at" TIMESTAMPTZ NOT NULL,
    "saved_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_leads_user_id_created_at" ON "leads"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_leads_user_id_status" ON "leads"("user_id", "status");

-- CreateIndex
CREATE INDEX "idx_leads_provider_record_id" ON "leads"("provider_record_id");

-- CreateIndex
CREATE INDEX "idx_leads_created_by_id" ON "leads"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_leads_updated_by_id" ON "leads"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_leads_deleted_by_id" ON "leads"("deleted_by_id");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
