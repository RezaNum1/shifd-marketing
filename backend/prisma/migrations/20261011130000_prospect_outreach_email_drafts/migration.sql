-- Add prospect email drafting and register its M2 operation without weakening
-- the existing operation allowlists.
ALTER TABLE "prompt_versions"
  DROP CONSTRAINT "prompt_versions_operation_check";
ALTER TABLE "prompt_versions"
  ADD CONSTRAINT "prompt_versions_operation_check" CHECK (
    ("module" = 'M2' AND "operation" IN ('generate', 'creative_reference.concepts', 'idea.discovery.web_search', 'telegram.ideation.chat', 'telegram.ideation.structure', 'prospect.company.research', 'prospect.outreach.email_draft')) OR
    ("module" = 'M3' AND "operation" = 'adapt') OR
    ("module" = 'M4' AND "operation" = 'brand_check')
  );

ALTER TABLE "ai_request_logs"
  DROP CONSTRAINT "ai_request_logs_module_operation_check";
ALTER TABLE "ai_request_logs"
  ADD CONSTRAINT "ai_request_logs_module_operation_check" CHECK (
    ("module" = 'M2' AND "operation" IN ('generate', 'creative_reference.concepts', 'creative_reference.image', 'idea.discovery.web_search', 'telegram.ideation.chat', 'telegram.ideation.structure', 'prospect.company.research', 'prospect.outreach.email_draft')) OR
    ("module" = 'M3' AND "operation" = 'adapt') OR
    ("module" = 'M4' AND "operation" = 'brand_check')
  );

CREATE TABLE "prospect_email_drafts" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "prospect_id" UUID NOT NULL,
  "created_by" UUID NOT NULL,
  "ai_request_log_id" UUID,
  "recipient_name" TEXT,
  "recipient_email" TEXT,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'English',
  "tone" TEXT NOT NULL DEFAULT 'professional',
  "objective" TEXT NOT NULL DEFAULT 'introduce_shifd_labs',
  "offering" TEXT NOT NULL DEFAULT 'custom_web_application',
  "origin" TEXT NOT NULL DEFAULT 'manual',
  "status" TEXT NOT NULL DEFAULT 'draft',
  "archived_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "prospect_email_drafts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prospect_email_drafts_subject_length_check" CHECK (char_length("subject") BETWEEN 1 AND 500),
  CONSTRAINT "prospect_email_drafts_body_length_check" CHECK (char_length("body") BETWEEN 1 AND 20000),
  CONSTRAINT "prospect_email_drafts_language_check" CHECK ("language" IN ('English', 'Indonesian')),
  CONSTRAINT "prospect_email_drafts_tone_check" CHECK ("tone" IN ('professional', 'consultative', 'friendly_professional', 'concise')),
  CONSTRAINT "prospect_email_drafts_objective_check" CHECK ("objective" IN ('introduce_shifd_labs', 'introduce_service', 'introduce_shifd_approval', 'explore_partnership', 'follow_up')),
  CONSTRAINT "prospect_email_drafts_offering_check" CHECK ("offering" IN ('custom_web_application', 'mobile_application', 'workflow_digitalization', 'it_consultation', 'shifd_approval')),
  CONSTRAINT "prospect_email_drafts_origin_check" CHECK ("origin" IN ('manual', 'ai')),
  CONSTRAINT "prospect_email_drafts_status_check" CHECK ("status" IN ('draft', 'archived')),
  CONSTRAINT "prospect_email_drafts_version_check" CHECK ("version" > 0),
  CONSTRAINT "prospect_email_drafts_recipient_email_check" CHECK ("recipient_email" IS NULL OR char_length("recipient_email") <= 320),
  CONSTRAINT "prospect_email_drafts_ai_origin_check" CHECK (("origin" = 'ai') OR "ai_request_log_id" IS NULL),
  CONSTRAINT "prospect_email_drafts_ai_request_log_id_key" UNIQUE ("ai_request_log_id"),
  CONSTRAINT "prospect_email_drafts_company_id_ai_request_log_id_key" UNIQUE ("company_id", "ai_request_log_id"),
  CONSTRAINT "prospect_email_drafts_company_id_id_key" UNIQUE ("company_id", "id")
);

CREATE TABLE "prospect_email_draft_claims" (
  "draft_id" UUID NOT NULL,
  "claim_id" UUID NOT NULL,
  CONSTRAINT "prospect_email_draft_claims_pkey" PRIMARY KEY ("draft_id", "claim_id")
);

CREATE UNIQUE INDEX "users_company_id_id_key" ON "users"("company_id", "id");
CREATE UNIQUE INDEX "ai_request_logs_company_id_id_key" ON "ai_request_logs"("company_id", "id");

CREATE INDEX "prospect_email_drafts_company_id_prospect_id_status_updated_at_idx"
  ON "prospect_email_drafts"("company_id", "prospect_id", "status", "updated_at" DESC);
CREATE INDEX "prospect_email_draft_claims_claim_id_idx"
  ON "prospect_email_draft_claims"("claim_id");

ALTER TABLE "prospect_email_drafts"
  ADD CONSTRAINT "prospect_email_drafts_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prospect_email_drafts"
  ADD CONSTRAINT "prospect_email_drafts_company_id_prospect_id_fkey"
  FOREIGN KEY ("company_id", "prospect_id") REFERENCES "prospects"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prospect_email_drafts"
  ADD CONSTRAINT "prospect_email_drafts_company_id_created_by_fkey"
  FOREIGN KEY ("company_id", "created_by") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prospect_email_drafts"
  ADD CONSTRAINT "prospect_email_drafts_company_id_ai_request_log_id_fkey"
  FOREIGN KEY ("company_id", "ai_request_log_id") REFERENCES "ai_request_logs"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prospect_email_draft_claims"
  ADD CONSTRAINT "prospect_email_draft_claims_draft_id_fkey"
  FOREIGN KEY ("draft_id") REFERENCES "prospect_email_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prospect_email_draft_claims"
  ADD CONSTRAINT "prospect_email_draft_claims_claim_id_fkey"
  FOREIGN KEY ("claim_id") REFERENCES "prospect_research_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
