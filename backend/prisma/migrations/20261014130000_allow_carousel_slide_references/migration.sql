ALTER TABLE "creative_references"
  DROP CONSTRAINT IF EXISTS "creative_references_concept_index_check";

ALTER TABLE "creative_references"
  ADD CONSTRAINT "creative_references_concept_index_check"
  CHECK ("concept_index" BETWEEN 0 AND 9);
