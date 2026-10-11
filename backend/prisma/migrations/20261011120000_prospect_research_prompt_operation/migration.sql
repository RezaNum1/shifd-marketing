-- Register the Phase 02 M2 company research operation while preserving the
-- existing allowlists and their module/operation validation rules.
ALTER TABLE "prompt_versions"
  DROP CONSTRAINT "prompt_versions_operation_check";

ALTER TABLE "prompt_versions"
  ADD CONSTRAINT "prompt_versions_operation_check" CHECK (
    ("module" = 'M2' AND "operation" IN ('generate', 'creative_reference.concepts', 'idea.discovery.web_search', 'telegram.ideation.chat', 'telegram.ideation.structure', 'prospect.company.research')) OR
    ("module" = 'M3' AND "operation" = 'adapt') OR
    ("module" = 'M4' AND "operation" = 'brand_check')
  );

ALTER TABLE "ai_request_logs"
  DROP CONSTRAINT "ai_request_logs_module_operation_check";

ALTER TABLE "ai_request_logs"
  ADD CONSTRAINT "ai_request_logs_module_operation_check" CHECK (
    ("module" = 'M2' AND "operation" IN ('generate', 'creative_reference.concepts', 'creative_reference.image', 'idea.discovery.web_search', 'telegram.ideation.chat', 'telegram.ideation.structure', 'prospect.company.research')) OR
    ("module" = 'M3' AND "operation" = 'adapt') OR
    ("module" = 'M4' AND "operation" = 'brand_check')
  );
