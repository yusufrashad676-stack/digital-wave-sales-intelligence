-- CreateEnum
CREATE TYPE "SearchJobStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'RUNNING', 'COMPLETED', 'FAILED', 'PAUSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SearchExecutionStatus" AS ENUM ('CREATED', 'RUNNING', 'COMPLETED', 'FAILED', 'TIMED_OUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SearchExecutionTrigger" AS ENUM ('MANUAL', 'SCHEDULE', 'WORKFLOW');

-- CreateEnum
CREATE TYPE "SearchResultVerificationStatus" AS ENUM ('VERIFIED', 'UNVERIFIED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "import_sources" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "capabilities" JSONB NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "import_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_jobs" (
    "id" TEXT NOT NULL,
    "query" VARCHAR(500) NOT NULL,
    "filters" JSONB NOT NULL,
    "status" "SearchJobStatus" NOT NULL DEFAULT 'DRAFT',
    "user_id" TEXT,
    "workspace_id" TEXT,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "search_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_executions" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "trigger" "SearchExecutionTrigger" NOT NULL DEFAULT 'MANUAL',
    "status" "SearchExecutionStatus" NOT NULL DEFAULT 'CREATED',
    "import_source_id" TEXT NOT NULL,
    "provider_request" JSONB,
    "started_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ,
    "metrics" JSONB,
    "error" VARCHAR(2000),
    "correlation_id" VARCHAR(64),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "search_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_imports" (
    "id" TEXT NOT NULL,
    "execution_id" TEXT,
    "import_source_id" TEXT NOT NULL,
    "external_id" VARCHAR(512),
    "format" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "content_hash" VARCHAR(128),
    "payload_size" INTEGER,
    "record_count" INTEGER,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlation_id" VARCHAR(64),
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "raw_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_results" (
    "id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "raw_import_id" TEXT,
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
    "ordering" INTEGER NOT NULL DEFAULT 0,
    "verification_status" "SearchResultVerificationStatus" NOT NULL DEFAULT 'UNKNOWN',
    "company_id" TEXT,
    "retrieved_at" TIMESTAMPTZ NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,
    "deleted_by_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "search_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_import_sources_code" ON "import_sources"("code");

-- CreateIndex
CREATE INDEX "idx_import_sources_category" ON "import_sources"("category");

-- CreateIndex
CREATE INDEX "idx_import_sources_enabled" ON "import_sources"("enabled");

-- CreateIndex
CREATE INDEX "idx_import_sources_created_by_id" ON "import_sources"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_import_sources_updated_by_id" ON "import_sources"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_import_sources_deleted_by_id" ON "import_sources"("deleted_by_id");

-- CreateIndex
CREATE INDEX "idx_search_jobs_user_id_created_at" ON "search_jobs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_search_jobs_status_created_at" ON "search_jobs"("status", "created_at");

-- CreateIndex
CREATE INDEX "idx_search_jobs_workspace_id" ON "search_jobs"("workspace_id");

-- CreateIndex
CREATE INDEX "idx_search_jobs_created_by_id" ON "search_jobs"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_search_jobs_updated_by_id" ON "search_jobs"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_search_jobs_deleted_by_id" ON "search_jobs"("deleted_by_id");

-- CreateIndex
CREATE INDEX "idx_search_executions_job_id_created_at" ON "search_executions"("job_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_search_executions_import_source_id_status" ON "search_executions"("import_source_id", "status");

-- CreateIndex
CREATE INDEX "idx_search_executions_status" ON "search_executions"("status");

-- CreateIndex
CREATE INDEX "idx_search_executions_correlation_id" ON "search_executions"("correlation_id");

-- CreateIndex
CREATE INDEX "idx_search_executions_created_by_id" ON "search_executions"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_search_executions_updated_by_id" ON "search_executions"("updated_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_raw_imports_content_hash" ON "raw_imports"("content_hash");

-- CreateIndex
CREATE INDEX "idx_raw_imports_execution_id_external_id" ON "raw_imports"("execution_id", "external_id");

-- CreateIndex
CREATE INDEX "idx_raw_imports_import_source_id_received_at" ON "raw_imports"("import_source_id", "received_at");

-- CreateIndex
CREATE INDEX "idx_raw_imports_received_at" ON "raw_imports"("received_at");

-- CreateIndex
CREATE INDEX "idx_raw_imports_created_by_id" ON "raw_imports"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_raw_imports_updated_by_id" ON "raw_imports"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_search_results_execution_id_ordering" ON "search_results"("execution_id", "ordering");

-- CreateIndex
CREATE INDEX "idx_search_results_company_id" ON "search_results"("company_id");

-- CreateIndex
CREATE INDEX "idx_search_results_provider_record_id" ON "search_results"("provider_record_id");

-- CreateIndex
CREATE INDEX "idx_search_results_created_by_id" ON "search_results"("created_by_id");

-- CreateIndex
CREATE INDEX "idx_search_results_updated_by_id" ON "search_results"("updated_by_id");

-- CreateIndex
CREATE INDEX "idx_search_results_deleted_by_id" ON "search_results"("deleted_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_search_results_execution_id_provider_record_id" ON "search_results"("execution_id", "provider_record_id");

-- AddForeignKey
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_sources" ADD CONSTRAINT "import_sources_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_jobs" ADD CONSTRAINT "search_jobs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_jobs" ADD CONSTRAINT "search_jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_jobs" ADD CONSTRAINT "search_jobs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_jobs" ADD CONSTRAINT "search_jobs_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_jobs" ADD CONSTRAINT "search_jobs_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_executions" ADD CONSTRAINT "search_executions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "search_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_executions" ADD CONSTRAINT "search_executions_import_source_id_fkey" FOREIGN KEY ("import_source_id") REFERENCES "import_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_executions" ADD CONSTRAINT "search_executions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_executions" ADD CONSTRAINT "search_executions_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_imports" ADD CONSTRAINT "raw_imports_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "search_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_imports" ADD CONSTRAINT "raw_imports_import_source_id_fkey" FOREIGN KEY ("import_source_id") REFERENCES "import_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_imports" ADD CONSTRAINT "raw_imports_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_imports" ADD CONSTRAINT "raw_imports_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_results" ADD CONSTRAINT "search_results_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "search_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_results" ADD CONSTRAINT "search_results_raw_import_id_fkey" FOREIGN KEY ("raw_import_id") REFERENCES "raw_imports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_results" ADD CONSTRAINT "search_results_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_results" ADD CONSTRAINT "search_results_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_results" ADD CONSTRAINT "search_results_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_results" ADD CONSTRAINT "search_results_deleted_by_id_fkey" FOREIGN KEY ("deleted_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
