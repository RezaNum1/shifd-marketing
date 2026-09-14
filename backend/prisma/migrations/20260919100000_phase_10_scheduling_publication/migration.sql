-- Phase 10: canonical schedules, manual publication facts, and calendar state.
-- Forward-only. No automatic publisher, worker, metric table, or social API is
-- introduced by this migration.

CREATE TABLE "content_schedules" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMPTZ(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "approval_action_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "content_schedules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "content_schedules_variant_id_key" UNIQUE ("variant_id"),
    CONSTRAINT "content_schedules_id_variant_id_key" UNIQUE ("id", "variant_id"),
    CONSTRAINT "content_schedules_timezone_nonblank_check" CHECK (btrim("timezone") <> ''),
    CONSTRAINT "content_schedules_version_check" CHECK ("version" > 0),
    CONSTRAINT "content_schedules_cancellation_pair_check" CHECK (
      ("cancelled_at" IS NULL AND "cancellation_reason" IS NULL)
      OR ("cancelled_at" IS NOT NULL AND btrim(COALESCE("cancellation_reason", '')) <> '')
    )
);

CREATE INDEX "content_schedules_actionable_scheduled_at_idx"
  ON "content_schedules"("scheduled_at")
  WHERE "cancelled_at" IS NULL;

ALTER TABLE "content_schedules"
  ADD CONSTRAINT "content_schedules_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "platform_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_schedules"
  ADD CONSTRAINT "content_schedules_approval_action_id_fkey"
  FOREIGN KEY ("approval_action_id") REFERENCES "approval_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_schedules"
  ADD CONSTRAINT "content_schedules_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "publication_records" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "scheduled_at_snapshot" TIMESTAMPTZ(3) NOT NULL,
    "published_at" TIMESTAMPTZ(3) NOT NULL,
    "post_url" TEXT,
    "marked_by" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "publication_records_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "publication_records_variant_id_key" UNIQUE ("variant_id"),
    CONSTRAINT "publication_records_schedule_id_key" UNIQUE ("schedule_id"),
    CONSTRAINT "publication_records_version_check" CHECK ("version" > 0)
);

CREATE INDEX "publication_records_published_at_idx"
  ON "publication_records"("published_at");

ALTER TABLE "publication_records"
  ADD CONSTRAINT "publication_records_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "platform_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_records"
  ADD CONSTRAINT "publication_records_schedule_id_fkey"
  FOREIGN KEY ("schedule_id") REFERENCES "content_schedules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_records"
  ADD CONSTRAINT "publication_records_marked_by_fkey"
  FOREIGN KEY ("marked_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma keeps the two ORM relations scalar-simple so generated UUID defaults
-- remain safe. This migration-owned composite FK is the stronger invariant:
-- a publication's schedule and variant must be the same pair.
ALTER TABLE "publication_records"
  ADD CONSTRAINT "publication_records_schedule_variant_fkey"
  FOREIGN KEY ("schedule_id", "variant_id")
  REFERENCES "content_schedules"("id", "variant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "content_events" DROP CONSTRAINT "content_events_event_type_check";
ALTER TABLE "content_events" ADD CONSTRAINT "content_events_event_type_check" CHECK
  ("event_type" IN (
    'brief_created', 'content_updated', 'variant_updated', 'progress_changed',
    'content_duplicated', 'content_archived', 'ai_generated', 'ai_adapted',
    'ai_brand_checked', 'review_override_recorded', 'content_approved',
    'revision_requested', 'schedule_created', 'schedule_updated',
    'schedule_cancelled', 'publication_recorded', 'publication_corrected'
  ));
