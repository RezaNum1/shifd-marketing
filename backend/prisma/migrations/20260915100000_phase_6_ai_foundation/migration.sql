-- Phase 6: AI configuration and M2 execution evidence only.
-- Forward-only; no M3/M4 result, approval, scheduling, publication, or metrics
-- tables are introduced.

CREATE TABLE "ai_settings" (
    "company_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model_id" TEXT,
    "model_display_name" TEXT NOT NULL,
    "generation_language" TEXT NOT NULL DEFAULT 'English',
    "mode" TEXT NOT NULL DEFAULT 'real',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "ai_settings_pkey" PRIMARY KEY ("company_id"),
    CONSTRAINT "ai_settings_provider_check" CHECK ("provider" = 'anthropic'),
    CONSTRAINT "ai_settings_language_check" CHECK ("generation_language" IN ('English', 'Indonesian')),
    CONSTRAINT "ai_settings_mode_check" CHECK ("mode" IN ('real', 'demo')),
    CONSTRAINT "ai_settings_model_display_name_check" CHECK (btrim("model_display_name") <> ''),
    CONSTRAINT "ai_settings_version_check" CHECK ("version" > 0)
);

CREATE TABLE "prompt_versions" (
    "id" UUID NOT NULL,
    "module" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "template_reference" TEXT NOT NULL,
    "template_digest" TEXT NOT NULL,
    "output_schema_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "prompt_versions_module_check" CHECK ("module" IN ('M2', 'M3', 'M4')),
    CONSTRAINT "prompt_versions_operation_check" CHECK (
      ("module" = 'M2' AND "operation" = 'generate') OR
      ("module" = 'M3' AND "operation" = 'adapt') OR
      ("module" = 'M4' AND "operation" = 'brand_check')
    ),
    CONSTRAINT "prompt_versions_status_check" CHECK ("status" IN ('active', 'retired')),
    CONSTRAINT "prompt_versions_version_nonblank_check" CHECK (btrim("version") <> ''),
    CONSTRAINT "prompt_versions_template_reference_nonblank_check" CHECK (btrim("template_reference") <> ''),
    CONSTRAINT "prompt_versions_template_digest_check" CHECK ("template_digest" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "prompt_versions_output_schema_nonblank_check" CHECK (btrim("output_schema_version") <> ''),
    CONSTRAINT "prompt_versions_module_version_key" UNIQUE ("module", "version")
);

CREATE UNIQUE INDEX "prompt_versions_one_active_module_key"
  ON "prompt_versions"("module") WHERE "status" = 'active';
CREATE INDEX "prompt_versions_module_status_idx" ON "prompt_versions"("module", "status");

CREATE TABLE "ai_request_logs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "content_id" UUID,
    "variant_id" UUID,
    "requested_by" UUID NOT NULL,
    "prompt_version_id" UUID NOT NULL,
    "module" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "editorial_revision" INTEGER,
    "variant_revision" INTEGER,
    "input_hash" TEXT NOT NULL,
    "input_snapshot" JSONB NOT NULL,
    "input_tokens" BIGINT,
    "output_tokens" BIGINT,
    "estimated_cost_usd" DECIMAL(18,8),
    "cost_basis" JSONB,
    "latency_ms" INTEGER,
    "status" TEXT NOT NULL,
    "error_code" TEXT,
    "error_message" TEXT,
    "provider_request_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "ai_request_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_request_logs_module_operation_check" CHECK (
      ("module" = 'M2' AND "operation" = 'generate') OR
      ("module" = 'M3' AND "operation" = 'adapt') OR
      ("module" = 'M4' AND "operation" = 'brand_check')
    ),
    CONSTRAINT "ai_request_logs_provider_check" CHECK ("provider" = 'anthropic'),
    CONSTRAINT "ai_request_logs_mode_check" CHECK ("mode" IN ('real', 'demo')),
    CONSTRAINT "ai_request_logs_language_check" CHECK ("language" IN ('English', 'Indonesian')),
    CONSTRAINT "ai_request_logs_status_check" CHECK ("status" IN ('pending', 'success', 'failed', 'stale')),
    CONSTRAINT "ai_request_logs_input_hash_check" CHECK ("input_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "ai_request_logs_editorial_revision_check" CHECK ("editorial_revision" IS NULL OR "editorial_revision" > 0),
    CONSTRAINT "ai_request_logs_variant_revision_check" CHECK ("variant_revision" IS NULL OR "variant_revision" > 0),
    CONSTRAINT "ai_request_logs_input_tokens_check" CHECK ("input_tokens" IS NULL OR "input_tokens" >= 0),
    CONSTRAINT "ai_request_logs_output_tokens_check" CHECK ("output_tokens" IS NULL OR "output_tokens" >= 0),
    CONSTRAINT "ai_request_logs_cost_check" CHECK ("estimated_cost_usd" IS NULL OR "estimated_cost_usd" >= 0),
    CONSTRAINT "ai_request_logs_latency_check" CHECK ("latency_ms" IS NULL OR "latency_ms" >= 0)
);

CREATE INDEX "ai_request_logs_company_id_created_at_id_idx"
  ON "ai_request_logs"("company_id", "created_at" DESC, "id" DESC);
CREATE INDEX "ai_request_logs_content_id_created_at_idx"
  ON "ai_request_logs"("content_id", "created_at" DESC);
CREATE INDEX "ai_request_logs_status_idx" ON "ai_request_logs"("status");

CREATE TABLE "ai_rate_versions" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "input_usd_per_million" DECIMAL(18,8) NOT NULL,
    "output_usd_per_million" DECIMAL(18,8) NOT NULL,
    "effective_from" TIMESTAMPTZ(3) NOT NULL,
    "source_reference" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_rate_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ai_rate_versions_provider_check" CHECK ("provider" = 'anthropic'),
    CONSTRAINT "ai_rate_versions_input_rate_check" CHECK ("input_usd_per_million" >= 0),
    CONSTRAINT "ai_rate_versions_output_rate_check" CHECK ("output_usd_per_million" >= 0),
    CONSTRAINT "ai_rate_versions_version_nonblank_check" CHECK (btrim("version") <> ''),
    CONSTRAINT "ai_rate_versions_source_nonblank_check" CHECK (btrim("source_reference") <> ''),
    CONSTRAINT "ai_rate_versions_provider_model_version_key" UNIQUE ("provider", "model", "version")
);

CREATE INDEX "ai_rate_versions_provider_model_effective_from_idx"
  ON "ai_rate_versions"("provider", "model", "effective_from");

ALTER TABLE "ai_settings" ADD CONSTRAINT "ai_settings_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_request_logs" ADD CONSTRAINT "ai_request_logs_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_request_logs" ADD CONSTRAINT "ai_request_logs_content_id_fkey"
  FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_request_logs" ADD CONSTRAINT "ai_request_logs_content_variant_fkey"
  FOREIGN KEY ("content_id", "variant_id") REFERENCES "platform_variants"("content_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_request_logs" ADD CONSTRAINT "ai_request_logs_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "platform_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_request_logs" ADD CONSTRAINT "ai_request_logs_requested_by_fkey"
  FOREIGN KEY ("requested_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_request_logs" ADD CONSTRAINT "ai_request_logs_prompt_version_id_fkey"
  FOREIGN KEY ("prompt_version_id") REFERENCES "prompt_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "request_idempotency" ADD COLUMN "ai_request_id" UUID;
CREATE UNIQUE INDEX "request_idempotency_ai_request_id_key"
  ON "request_idempotency"("ai_request_id") WHERE "ai_request_id" IS NOT NULL;
ALTER TABLE "request_idempotency" ADD CONSTRAINT "request_idempotency_ai_request_id_fkey"
  FOREIGN KEY ("ai_request_id") REFERENCES "ai_request_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "content_events" DROP CONSTRAINT "content_events_event_type_check";
ALTER TABLE "content_events" ADD CONSTRAINT "content_events_event_type_check" CHECK
  ("event_type" IN ('brief_created', 'content_updated', 'variant_updated', 'progress_changed', 'content_duplicated', 'content_archived', 'ai_generated'));

-- Existing Companies receive neutral, non-secret AI settings. This does not
-- overwrite an operator/user setting when the migration is rerun elsewhere.
INSERT INTO "ai_settings" ("company_id", "provider", "model_display_name", "generation_language", "mode")
SELECT "id", 'anthropic', 'Claude', 'English', 'real' FROM "companies"
ON CONFLICT ("company_id") DO NOTHING;
