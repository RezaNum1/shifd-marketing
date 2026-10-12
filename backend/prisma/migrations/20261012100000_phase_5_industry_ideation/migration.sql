ALTER TABLE "content_ideas"
  ADD COLUMN "target_industry" TEXT,
  ADD COLUMN "target_prospect_id" UUID,
  ADD COLUMN "content_objective" TEXT,
  ADD COLUMN "evidence_references" JSONB;

ALTER TABLE "content_ideas"
  ADD CONSTRAINT "content_ideas_target_industry_length_check"
  CHECK ("target_industry" IS NULL OR char_length("target_industry") <= 120),
  ADD CONSTRAINT "content_ideas_content_objective_length_check"
  CHECK ("content_objective" IS NULL OR char_length("content_objective") <= 40);

CREATE INDEX "content_ideas_company_target_industry_idx"
  ON "content_ideas"("company_id", "target_industry");
CREATE INDEX "content_ideas_company_target_prospect_idx"
  ON "content_ideas"("company_id", "target_prospect_id");
