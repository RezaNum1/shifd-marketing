CREATE TABLE "outbound_activities" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "prospect_id" UUID NOT NULL,
  "email_draft_id" UUID,
  "activity_type" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'recorded',
  "occurred_at" TIMESTAMPTZ(3),
  "due_at" TIMESTAMPTZ(3),
  "completed_at" TIMESTAMPTZ(3),
  "contact_name" TEXT,
  "contact_email" TEXT,
  "subject" TEXT,
  "description" TEXT,
  "response_classification" TEXT,
  "provenance" TEXT NOT NULL,
  "notes" TEXT,
  "created_by" UUID NOT NULL,
  "updated_by" UUID,
  "archived_by" UUID,
  "archived_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "outbound_activities_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "outbound_activities_type_check" CHECK ("activity_type" IN ('email_sent', 'follow_up', 'reply_received', 'meeting', 'product_demonstration', 'other')),
  CONSTRAINT "outbound_activities_status_check" CHECK ("status" IN ('recorded', 'pending', 'scheduled', 'completed', 'cancelled')),
  CONSTRAINT "outbound_activities_response_check" CHECK ("response_classification" IS NULL OR "response_classification" IN ('interested', 'not_interested', 'requested_information', 'follow_up_requested', 'meeting_requested', 'other')),
  CONSTRAINT "outbound_activities_provenance_check" CHECK ("provenance" IN ('historical', 'artifact_assisted', 'non_artifact_assisted')),
  CONSTRAINT "outbound_activities_contact_email_check" CHECK ("contact_email" IS NULL OR char_length("contact_email") <= 320),
  CONSTRAINT "outbound_activities_subject_check" CHECK ("subject" IS NULL OR char_length("subject") <= 500),
  CONSTRAINT "outbound_activities_description_check" CHECK ("description" IS NULL OR char_length("description") <= 1000),
  CONSTRAINT "outbound_activities_notes_check" CHECK ("notes" IS NULL OR char_length("notes") <= 5000),
  CONSTRAINT "outbound_activities_response_type_check" CHECK (("activity_type" = 'reply_received') = ("response_classification" IS NOT NULL)),
  CONSTRAINT "outbound_activities_shape_check" CHECK (
    ("activity_type" = 'email_sent' AND "status" = 'recorded' AND "occurred_at" IS NOT NULL AND "subject" IS NOT NULL AND "due_at" IS NULL AND "completed_at" IS NULL) OR
    ("activity_type" = 'reply_received' AND "status" = 'recorded' AND "occurred_at" IS NOT NULL AND "due_at" IS NULL AND "completed_at" IS NULL) OR
    ("activity_type" = 'other' AND "status" = 'recorded' AND "occurred_at" IS NOT NULL AND "description" IS NOT NULL AND "due_at" IS NULL AND "completed_at" IS NULL) OR
    ("activity_type" = 'follow_up' AND "status" = 'pending' AND "occurred_at" IS NULL AND "due_at" IS NOT NULL AND "completed_at" IS NULL) OR
    ("activity_type" = 'follow_up' AND "status" = 'completed' AND "occurred_at" IS NOT NULL AND "due_at" IS NOT NULL AND "completed_at" IS NOT NULL AND "occurred_at" = "completed_at") OR
    ("activity_type" = 'follow_up' AND "status" = 'cancelled' AND "occurred_at" IS NULL AND "due_at" IS NOT NULL AND "completed_at" IS NULL) OR
    ("activity_type" IN ('meeting', 'product_demonstration') AND "status" IN ('scheduled', 'completed', 'cancelled') AND "occurred_at" IS NOT NULL AND "due_at" IS NULL AND (("status" = 'completed' AND "completed_at" IS NOT NULL) OR ("status" <> 'completed' AND "completed_at" IS NULL)))
  ),
  CONSTRAINT "outbound_activities_archive_shape_check" CHECK (("archived_at" IS NULL) = ("archived_by" IS NULL))
);

CREATE INDEX "outbound_activities_company_id_prospect_id_occurred_at_created_at_idx" ON "outbound_activities"("company_id", "prospect_id", "occurred_at" DESC, "created_at" DESC);
CREATE INDEX "outbound_activities_company_id_prospect_id_status_due_at_idx" ON "outbound_activities"("company_id", "prospect_id", "status", "due_at");
CREATE INDEX "outbound_activities_company_id_email_draft_id_idx" ON "outbound_activities"("company_id", "email_draft_id");

ALTER TABLE "outbound_activities" ADD CONSTRAINT "outbound_activities_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbound_activities" ADD CONSTRAINT "outbound_activities_company_id_prospect_id_fkey" FOREIGN KEY ("company_id", "prospect_id") REFERENCES "prospects"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbound_activities" ADD CONSTRAINT "outbound_activities_company_id_email_draft_id_fkey" FOREIGN KEY ("company_id", "email_draft_id") REFERENCES "prospect_email_drafts"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbound_activities" ADD CONSTRAINT "outbound_activities_company_id_created_by_fkey" FOREIGN KEY ("company_id", "created_by") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbound_activities" ADD CONSTRAINT "outbound_activities_company_id_updated_by_fkey" FOREIGN KEY ("company_id", "updated_by") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "outbound_activities" ADD CONSTRAINT "outbound_activities_company_id_archived_by_fkey" FOREIGN KEY ("company_id", "archived_by") REFERENCES "users"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
