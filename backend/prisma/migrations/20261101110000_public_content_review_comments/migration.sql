CREATE TABLE "content_review_comments" (
    "id" UUID NOT NULL,
    "share_id" UUID NOT NULL,
    "message" VARCHAR(5000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_review_comments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "content_review_comments_message_check" CHECK (length(btrim("message")) > 0)
);

CREATE INDEX "content_review_comments_share_id_created_at_idx"
ON "content_review_comments"("share_id", "created_at");

ALTER TABLE "content_review_comments"
ADD CONSTRAINT "content_review_comments_share_id_fkey"
FOREIGN KEY ("share_id") REFERENCES "content_review_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;
