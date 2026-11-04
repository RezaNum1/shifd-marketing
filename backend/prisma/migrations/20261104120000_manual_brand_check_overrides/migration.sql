-- Allow a human to proceed without an AI Brand Check when the reviewer
-- explicitly records the manual override evidence in reviewed_variants.

ALTER TABLE "approval_actions"
  DROP CONSTRAINT "approval_actions_override_evidence_check";

ALTER TABLE "approval_actions"
  ADD CONSTRAINT "approval_actions_override_evidence_check" CHECK (
    (
      "action" = 'override'
      AND "variant_id" IS NOT NULL
      AND (
        num_nonnulls("assessment_id", "failed_ai_request_id") = 1
        OR (
          num_nonnulls("assessment_id", "failed_ai_request_id") = 0
          AND COALESCE(
            jsonb_typeof("reviewed_variants") = 'object'
            AND "reviewed_variants"->>'evidenceType' = 'manual_brand_check_override'
            AND jsonb_typeof("reviewed_variants"->'variantRevision') = 'number'
            AND "reviewed_variants"->>'variantRevision' ~ '^[1-9][0-9]*$'
            AND jsonb_typeof("reviewed_variants"->'effectiveAssetIds') = 'array',
            FALSE
          )
        )
      )
    )
    OR (
      "action" <> 'override'
      AND "failed_ai_request_id" IS NULL
    )
  );
