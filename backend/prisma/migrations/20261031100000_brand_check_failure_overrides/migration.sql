-- Allow an explicit, justified human bypass when an M4 execution fails
-- before it can produce a Brand Assessment. The failed AI request remains
-- the immutable evidence for the decision.

ALTER TABLE "approval_actions"
  ADD COLUMN "failed_ai_request_id" UUID;

CREATE INDEX "approval_actions_failed_ai_request_id_idx"
  ON "approval_actions"("failed_ai_request_id");

ALTER TABLE "approval_actions"
  ADD CONSTRAINT "approval_actions_failed_ai_request_id_fkey"
  FOREIGN KEY ("failed_ai_request_id") REFERENCES "ai_request_logs"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ai_request_logs"
  ADD CONSTRAINT "ai_request_logs_content_id_variant_id_id_key"
  UNIQUE ("content_id", "variant_id", "id");

ALTER TABLE "approval_actions"
  ADD CONSTRAINT "approval_actions_failed_ai_request_scope_fkey"
  FOREIGN KEY ("content_id", "variant_id", "failed_ai_request_id")
  REFERENCES "ai_request_logs"("content_id", "variant_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "approval_actions"
  ADD CONSTRAINT "approval_actions_override_evidence_check" CHECK (
    (
      "action" = 'override'
      AND "variant_id" IS NOT NULL
      AND num_nonnulls("assessment_id", "failed_ai_request_id") = 1
    )
    OR (
      "action" <> 'override'
      AND "failed_ai_request_id" IS NULL
    )
  );
