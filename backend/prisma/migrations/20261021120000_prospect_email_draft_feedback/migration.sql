CREATE TABLE "prospect_email_draft_feedback" (
    "id" UUID NOT NULL,
    "draft_id" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prospect_email_draft_feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "prospect_email_draft_feedback_draft_id_created_at_idx"
ON "prospect_email_draft_feedback"("draft_id", "created_at" DESC);

ALTER TABLE "prospect_email_draft_feedback"
ADD CONSTRAINT "prospect_email_draft_feedback_draft_id_fkey"
FOREIGN KEY ("draft_id") REFERENCES "prospect_email_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
