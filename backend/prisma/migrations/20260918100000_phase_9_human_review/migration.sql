-- Phase 9: Human Review, Override, Approval, and Request Revision.
-- Forward-only. Scheduling, publication, and performance remain deferred.

CREATE TABLE "approval_actions" (
    "id" UUID NOT NULL,
    "content_id" UUID NOT NULL,
    "variant_id" UUID,
    "assessment_id" UUID,
    "editorial_revision" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" UUID NOT NULL,
    "justification" TEXT,
    "checklist" JSONB,
    "reviewed_variants" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_actions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "approval_actions_content_id_id_key" UNIQUE ("content_id", "id"),
    CONSTRAINT "approval_actions_editorial_revision_check" CHECK ("editorial_revision" > 0),
    CONSTRAINT "approval_actions_action_check" CHECK ("action" IN ('approve', 'request_revision', 'override')),
    CONSTRAINT "approval_actions_justification_check" CHECK (
      "action" = 'approve' OR btrim(COALESCE("justification", '')) <> ''
    )
);

CREATE INDEX "approval_actions_content_id_created_at_id_idx"
  ON "approval_actions"("content_id", "created_at" DESC, "id" DESC);
CREATE INDEX "approval_actions_variant_id_idx" ON "approval_actions"("variant_id");
CREATE INDEX "approval_actions_assessment_id_idx" ON "approval_actions"("assessment_id");

ALTER TABLE "approval_actions"
  ADD CONSTRAINT "approval_actions_content_id_fkey"
  FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_actions"
  ADD CONSTRAINT "approval_actions_content_variant_fkey"
  FOREIGN KEY ("content_id", "variant_id") REFERENCES "platform_variants"("content_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_actions"
  ADD CONSTRAINT "approval_actions_variant_assessment_fkey"
  FOREIGN KEY ("variant_id", "assessment_id") REFERENCES "brand_assessments"("variant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "approval_actions"
  ADD CONSTRAINT "approval_actions_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contents" ADD COLUMN "current_approval_id" UUID;
ALTER TABLE "contents"
  ADD CONSTRAINT "contents_current_approval_fkey"
  FOREIGN KEY ("id", "current_approval_id") REFERENCES "approval_actions"("content_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "content_events" DROP CONSTRAINT "content_events_event_type_check";
ALTER TABLE "content_events" ADD CONSTRAINT "content_events_event_type_check" CHECK
  ("event_type" IN (
    'brief_created', 'content_updated', 'variant_updated', 'progress_changed',
    'content_duplicated', 'content_archived', 'ai_generated', 'ai_adapted',
    'ai_brand_checked', 'review_override_recorded', 'content_approved',
    'revision_requested'
  ));
