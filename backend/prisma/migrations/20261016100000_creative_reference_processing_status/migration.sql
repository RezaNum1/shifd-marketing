ALTER TABLE "creative_reference_batches"
DROP CONSTRAINT "creative_reference_batches_status_check";

ALTER TABLE "creative_reference_batches"
ADD CONSTRAINT "creative_reference_batches_status_check"
CHECK ("status" IN ('pending', 'processing', 'completed', 'partial', 'failed'));
