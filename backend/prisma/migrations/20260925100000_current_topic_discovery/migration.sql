-- Source-backed current topic discovery is an M2 ideation operation.
-- Forward-only: preserve prior prompt identities and extend the evidence model.

ALTER TABLE "prompt_versions"
  DROP CONSTRAINT "prompt_versions_operation_check";

ALTER TABLE "prompt_versions"
  ADD CONSTRAINT "prompt_versions_operation_check" CHECK (
    ("module" = 'M2' AND "operation" IN ('generate', 'creative_reference.concepts', 'idea.discovery.web_search')) OR
    ("module" = 'M3' AND "operation" = 'adapt') OR
    ("module" = 'M4' AND "operation" = 'brand_check')
  );

ALTER TABLE "ai_request_logs"
  DROP CONSTRAINT "ai_request_logs_module_operation_check";

ALTER TABLE "ai_request_logs"
  ADD CONSTRAINT "ai_request_logs_module_operation_check" CHECK (
    ("module" = 'M2' AND "operation" IN ('generate', 'creative_reference.concepts', 'creative_reference.image', 'idea.discovery.web_search')) OR
    ("module" = 'M3' AND "operation" = 'adapt') OR
    ("module" = 'M4' AND "operation" = 'brand_check')
  );

CREATE TABLE "topic_discovery_runs" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "product_id" UUID,
  "market" TEXT NOT NULL,
  "timeframe" TEXT NOT NULL,
  "focus" TEXT,
  "status" TEXT NOT NULL,
  "ai_request_log_id" UUID NOT NULL,
  "searched_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "topic_discovery_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "topic_discovery_runs_market_check" CHECK ("market" = 'ID'),
  CONSTRAINT "topic_discovery_runs_timeframe_check" CHECK ("timeframe" IN ('last_7_days', 'last_30_days')),
  CONSTRAINT "topic_discovery_runs_status_check" CHECK ("status" IN ('pending', 'completed', 'empty', 'failed')),
  CONSTRAINT "topic_discovery_runs_focus_length_check" CHECK ("focus" IS NULL OR char_length("focus") <= 240),
  CONSTRAINT "topic_discovery_runs_ai_request_key" UNIQUE ("ai_request_log_id")
);

CREATE TABLE "topic_candidates" (
  "id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "product_id" UUID,
  "position" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "why_current" TEXT NOT NULL,
  "relevance_to_company" TEXT NOT NULL,
  "content_angle" TEXT NOT NULL,
  "suggested_objective" TEXT NOT NULL,
  "suggested_platforms" TEXT[] NOT NULL,
  "source_evidence" JSONB NOT NULL,
  "selected_at" TIMESTAMPTZ(3),
  "created_idea_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "topic_candidates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "topic_candidates_position_check" CHECK ("position" BETWEEN 1 AND 6),
  CONSTRAINT "topic_candidates_objective_check" CHECK ("suggested_objective" IN ('awareness', 'education', 'engagement', 'credibility', 'consideration', 'discovery')),
  CONSTRAINT "topic_candidates_platforms_check" CHECK (cardinality("suggested_platforms") BETWEEN 1 AND 2 AND "suggested_platforms" <@ ARRAY['instagram', 'linkedin']::TEXT[]),
  CONSTRAINT "topic_candidates_source_evidence_check" CHECK (jsonb_typeof("source_evidence") = 'array' AND jsonb_array_length("source_evidence") > 0),
  CONSTRAINT "topic_candidates_run_position_key" UNIQUE ("run_id", "position"),
  CONSTRAINT "topic_candidates_created_idea_key" UNIQUE ("created_idea_id")
);

CREATE INDEX "topic_discovery_runs_company_created_idx" ON "topic_discovery_runs"("company_id", "created_at" DESC, "id" DESC);
CREATE INDEX "topic_discovery_runs_company_status_created_idx" ON "topic_discovery_runs"("company_id", "status", "created_at" DESC);
CREATE INDEX "topic_candidates_company_created_idx" ON "topic_candidates"("company_id", "created_at" DESC, "id" DESC);
CREATE INDEX "topic_candidates_run_position_idx" ON "topic_candidates"("run_id", "position");

ALTER TABLE "topic_discovery_runs" ADD CONSTRAINT "topic_discovery_runs_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "topic_discovery_runs" ADD CONSTRAINT "topic_discovery_runs_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "topic_discovery_runs" ADD CONSTRAINT "topic_discovery_runs_ai_request_log_id_fkey"
  FOREIGN KEY ("ai_request_log_id") REFERENCES "ai_request_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "topic_candidates" ADD CONSTRAINT "topic_candidates_run_id_fkey"
  FOREIGN KEY ("run_id") REFERENCES "topic_discovery_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "topic_candidates" ADD CONSTRAINT "topic_candidates_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "topic_candidates" ADD CONSTRAINT "topic_candidates_product_id_fkey"
  FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "topic_candidates" ADD CONSTRAINT "topic_candidates_created_idea_id_fkey"
  FOREIGN KEY ("created_idea_id") REFERENCES "content_ideas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
