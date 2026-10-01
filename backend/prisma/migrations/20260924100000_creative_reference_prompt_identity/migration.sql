-- Creative Reference is an M2-related AI operation, not M6 Performance.
-- Keep the original applied migration immutable and extend the existing
-- evidence constraints only enough to represent this operation correctly.

ALTER TABLE "prompt_versions"
  DROP CONSTRAINT "prompt_versions_operation_check";

ALTER TABLE "prompt_versions"
  ADD CONSTRAINT "prompt_versions_operation_check" CHECK (
    ("module" = 'M2' AND "operation" IN ('generate', 'creative_reference.concepts')) OR
    ("module" = 'M3' AND "operation" = 'adapt') OR
    ("module" = 'M4' AND "operation" = 'brand_check')
  );

DROP INDEX "prompt_versions_one_active_module_key";

CREATE UNIQUE INDEX "prompt_versions_one_active_module_operation_key"
  ON "prompt_versions"("module", "operation") WHERE "status" = 'active';

ALTER TABLE "ai_request_logs"
  DROP CONSTRAINT "ai_request_logs_module_operation_check";

ALTER TABLE "ai_request_logs"
  ADD CONSTRAINT "ai_request_logs_module_operation_check" CHECK (
    ("module" = 'M2' AND "operation" IN ('generate', 'creative_reference.concepts', 'creative_reference.image')) OR
    ("module" = 'M3' AND "operation" = 'adapt') OR
    ("module" = 'M4' AND "operation" = 'brand_check')
  );
