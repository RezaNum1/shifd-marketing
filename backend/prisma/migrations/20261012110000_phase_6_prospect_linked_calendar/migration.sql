ALTER TABLE "contents"
  ADD COLUMN "target_industry" TEXT,
  ADD COLUMN "target_prospect_id" UUID,
  ADD COLUMN "planning_notes" TEXT;

ALTER TABLE "contents"
  ADD CONSTRAINT "contents_target_industry_length_check"
  CHECK ("target_industry" IS NULL OR char_length("target_industry") <= 120),
  ADD CONSTRAINT "contents_planning_notes_length_check"
  CHECK ("planning_notes" IS NULL OR char_length("planning_notes") <= 2000);

CREATE INDEX "contents_company_target_industry_idx"
  ON "contents"("company_id", "target_industry");
CREATE INDEX "contents_company_target_prospect_idx"
  ON "contents"("company_id", "target_prospect_id");

ALTER TABLE "publication_records"
  ADD COLUMN "notes" TEXT;

ALTER TABLE "publication_records"
  ADD CONSTRAINT "publication_records_notes_length_check"
  CHECK ("notes" IS NULL OR char_length("notes") <= 2000);
