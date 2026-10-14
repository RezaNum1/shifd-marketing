CREATE TABLE "content_review_shares" (
    "id" UUID NOT NULL,
    "content_id" UUID NOT NULL,
    "created_by" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_review_shares_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "content_review_shares_token_hash_key" ON "content_review_shares"("token_hash");
CREATE INDEX "content_review_shares_content_id_expires_at_idx" ON "content_review_shares"("content_id", "expires_at");
CREATE UNIQUE INDEX "content_review_shares_one_active_per_content_key" ON "content_review_shares"("content_id") WHERE "revoked_at" IS NULL;

ALTER TABLE "content_review_shares"
ADD CONSTRAINT "content_review_shares_content_id_fkey"
FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "content_review_shares"
ADD CONSTRAINT "content_review_shares_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
