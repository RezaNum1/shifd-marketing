-- Read-only Instagram Insights integration: account null semantics and
-- provider-neutral publication observations.

ALTER TABLE "weekly_metrics"
  ALTER COLUMN "impressions" DROP NOT NULL,
  ALTER COLUMN "likes" DROP NOT NULL,
  ALTER COLUMN "comments" DROP NOT NULL,
  ALTER COLUMN "saves" DROP NOT NULL,
  ALTER COLUMN "likes" DROP DEFAULT,
  ALTER COLUMN "comments" DROP DEFAULT,
  ALTER COLUMN "saves" DROP DEFAULT;

CREATE TABLE "publication_metrics" (
    "id" UUID NOT NULL,
    "publication_record_id" UUID NOT NULL,
    "social_account_id" UUID NOT NULL,
    "external_media_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "observed_at" TIMESTAMPTZ(3) NOT NULL,
    "views" BIGINT,
    "reach" BIGINT,
    "likes" BIGINT,
    "comments" BIGINT,
    "saves" BIGINT,
    "shares" BIGINT,
    "total_interactions" BIGINT,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "publication_metrics_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "publication_metrics_platform_check" CHECK ("platform" IN ('instagram')),
    CONSTRAINT "publication_metrics_source_check" CHECK ("source" IN ('instagram_api')),
    CONSTRAINT "publication_metrics_counts_check" CHECK (
      ("views" IS NULL OR "views" >= 0) AND
      ("reach" IS NULL OR "reach" >= 0) AND
      ("likes" IS NULL OR "likes" >= 0) AND
      ("comments" IS NULL OR "comments" >= 0) AND
      ("saves" IS NULL OR "saves" >= 0) AND
      ("shares" IS NULL OR "shares" >= 0) AND
      ("total_interactions" IS NULL OR "total_interactions" >= 0)
    ),
    CONSTRAINT "publication_metrics_version_check" CHECK ("version" > 0),
    CONSTRAINT "publication_metrics_publication_source_key" UNIQUE ("publication_record_id", "source"),
    CONSTRAINT "publication_metrics_account_media_source_key" UNIQUE ("social_account_id", "external_media_id", "source")
);

CREATE INDEX "publication_metrics_publication_observed_idx"
  ON "publication_metrics"("publication_record_id", "observed_at");
CREATE INDEX "publication_metrics_account_observed_idx"
  ON "publication_metrics"("social_account_id", "observed_at");

ALTER TABLE "publication_metrics"
  ADD CONSTRAINT "publication_metrics_publication_record_id_fkey"
  FOREIGN KEY ("publication_record_id") REFERENCES "publication_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_metrics"
  ADD CONSTRAINT "publication_metrics_social_account_id_fkey"
  FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
