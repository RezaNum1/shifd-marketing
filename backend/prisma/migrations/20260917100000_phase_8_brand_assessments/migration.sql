-- Phase 8: M4 advisory Brand Consistency Checker.
-- Forward-only. This phase does not introduce Human Review or operational tables.

CREATE TABLE "brand_assessments" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "variant_revision" INTEGER NOT NULL,
    "input_hash" TEXT NOT NULL,
    "ai_request_id" UUID NOT NULL,
    "score" INTEGER NOT NULL,
    "result" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "checks" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brand_assessments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "brand_assessments_variant_id_id_key" UNIQUE ("variant_id", "id"),
    CONSTRAINT "brand_assessments_ai_request_id_key" UNIQUE ("ai_request_id"),
    CONSTRAINT "brand_assessments_variant_revision_check" CHECK ("variant_revision" > 0),
    CONSTRAINT "brand_assessments_input_hash_check" CHECK ("input_hash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "brand_assessments_score_check" CHECK ("score" >= 0 AND "score" <= 100),
    CONSTRAINT "brand_assessments_result_check" CHECK ("result" IN ('aligned', 'needs_attention')),
    CONSTRAINT "brand_assessments_recommendation_check" CHECK (btrim("recommendation") <> ''),
    CONSTRAINT "brand_assessments_checks_array_check" CHECK (jsonb_typeof("checks") = 'array' AND jsonb_array_length("checks") > 0)
);

CREATE INDEX "brand_assessments_variant_id_created_at_idx"
  ON "brand_assessments"("variant_id", "created_at" DESC);

ALTER TABLE "brand_assessments"
  ADD CONSTRAINT "brand_assessments_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "platform_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "brand_assessments"
  ADD CONSTRAINT "brand_assessments_ai_request_id_fkey"
  FOREIGN KEY ("ai_request_id") REFERENCES "ai_request_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_variants" ADD COLUMN "current_assessment_id" UUID;

ALTER TABLE "platform_variants"
  ADD CONSTRAINT "platform_variants_current_assessment_fkey"
  FOREIGN KEY ("id", "current_assessment_id") REFERENCES "brand_assessments"("variant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "content_events" DROP CONSTRAINT "content_events_event_type_check";
ALTER TABLE "content_events" ADD CONSTRAINT "content_events_event_type_check" CHECK
  ("event_type" IN (
    'brief_created', 'content_updated', 'variant_updated', 'progress_changed',
    'content_duplicated', 'content_archived', 'ai_generated', 'ai_adapted',
    'ai_brand_checked'
  ));
