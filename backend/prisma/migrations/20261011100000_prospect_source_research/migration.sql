CREATE TABLE "prospect_research_runs" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "prospect_id" UUID NOT NULL,
  "created_by" UUID NOT NULL,
  "ai_request_log_id" UUID NOT NULL,
  "prompt_version_id" UUID NOT NULL,
  "status" TEXT NOT NULL,
  "identity_status" TEXT NOT NULL,
  "identity_explanation" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "limitations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "researched_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prospect_research_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prospect_research_runs_company_id_id_key" UNIQUE ("company_id", "id"),
  CONSTRAINT "prospect_research_runs_ai_request_log_id_key" UNIQUE ("ai_request_log_id"),
  CONSTRAINT "prospect_research_runs_status_check" CHECK ("status" IN ('pending', 'completed', 'needs_confirmation', 'empty', 'failed')),
  CONSTRAINT "prospect_research_runs_identity_status_check" CHECK ("identity_status" IN ('matched', 'needs_confirmation')),
  CONSTRAINT "prospect_research_runs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "prospect_research_runs_prospect_id_fkey" FOREIGN KEY ("prospect_id") REFERENCES "prospects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "prospect_research_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "prospect_research_runs_ai_request_log_id_fkey" FOREIGN KEY ("ai_request_log_id") REFERENCES "ai_request_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "prospect_research_runs_prompt_version_id_fkey" FOREIGN KEY ("prompt_version_id") REFERENCES "prompt_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "prospect_research_runs_company_prospect_created_idx" ON "prospect_research_runs"("company_id", "prospect_id", "created_at" DESC);
CREATE INDEX "prospect_research_runs_company_status_idx" ON "prospect_research_runs"("company_id", "status");

CREATE TABLE "prospect_research_sources" (
  "id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "url" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "publisher" TEXT,
  "domain" TEXT NOT NULL,
  "retrieved_at" TIMESTAMPTZ(3) NOT NULL,
  "source_type" TEXT NOT NULL,
  "availability" TEXT NOT NULL DEFAULT 'retrieved',
  CONSTRAINT "prospect_research_sources_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prospect_research_sources_run_id_url_key" UNIQUE ("run_id", "url"),
  CONSTRAINT "prospect_research_sources_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "prospect_research_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "prospect_research_sources_url_check" CHECK ("url" ~ '^https?://'),
  CONSTRAINT "prospect_research_sources_type_check" CHECK ("source_type" IN ('official', 'external'))
);
CREATE INDEX "prospect_research_sources_run_id_idx" ON "prospect_research_sources"("run_id");

CREATE TABLE "prospect_research_claims" (
  "id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "text" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "claim_type" TEXT NOT NULL,
  "review_status" TEXT NOT NULL DEFAULT 'pending',
  "review_note" TEXT,
  "reviewed_at" TIMESTAMPTZ(3),
  "reviewed_by" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prospect_research_claims_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prospect_research_claims_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "prospect_research_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "prospect_research_claims_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "prospect_research_claims_type_check" CHECK ("claim_type" IN ('sourced_fact', 'hypothesis')),
  CONSTRAINT "prospect_research_claims_category_check" CHECK ("category" IN ('overview', 'industry', 'products_services', 'operations', 'market_segments', 'development', 'opportunity')),
  CONSTRAINT "prospect_research_claims_review_status_check" CHECK ("review_status" IN ('pending', 'approved', 'rejected')),
  CONSTRAINT "prospect_research_claims_text_length_check" CHECK (char_length(btrim("text")) BETWEEN 1 AND 1200)
);
CREATE INDEX "prospect_research_claims_run_type_review_idx" ON "prospect_research_claims"("run_id", "claim_type", "review_status");

CREATE TABLE "prospect_research_claim_sources" (
  "claim_id" UUID NOT NULL,
  "source_id" UUID NOT NULL,
  CONSTRAINT "prospect_research_claim_sources_pkey" PRIMARY KEY ("claim_id", "source_id"),
  CONSTRAINT "prospect_research_claim_sources_claim_id_fkey" FOREIGN KEY ("claim_id") REFERENCES "prospect_research_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "prospect_research_claim_sources_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "prospect_research_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
