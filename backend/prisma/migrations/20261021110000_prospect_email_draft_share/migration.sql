ALTER TABLE "prospect_email_drafts"
ADD COLUMN "share_token" TEXT;

CREATE UNIQUE INDEX "prospect_email_drafts_share_token_key"
ON "prospect_email_drafts"("share_token");
