CREATE TABLE "publication_metric_snapshots" (
  "id" UUID NOT NULL,
  "publication_record_id" UUID NOT NULL,
  "observed_at" TIMESTAMPTZ(3) NOT NULL,
  "views" BIGINT,
  "reach" BIGINT,
  "likes" BIGINT,
  "comments" BIGINT,
  "saves" BIGINT,
  "shares" BIGINT,
  "total_interactions" BIGINT,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "publication_metric_snapshots_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "publication_metric_snapshots_counts_check" CHECK (
    ("views" IS NULL OR "views" >= 0) AND
    ("reach" IS NULL OR "reach" >= 0) AND
    ("likes" IS NULL OR "likes" >= 0) AND
    ("comments" IS NULL OR "comments" >= 0) AND
    ("saves" IS NULL OR "saves" >= 0) AND
    ("shares" IS NULL OR "shares" >= 0) AND
    ("total_interactions" IS NULL OR "total_interactions" >= 0)
  )
);

CREATE INDEX "publication_metric_snapshots_publication_observed_idx"
  ON "publication_metric_snapshots"("publication_record_id", "observed_at");

ALTER TABLE "publication_metric_snapshots"
  ADD CONSTRAINT "publication_metric_snapshots_publication_record_id_fkey"
  FOREIGN KEY ("publication_record_id") REFERENCES "publication_records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve the latest observations already stored by Instagram sync as the first points in each trend.
INSERT INTO "publication_metric_snapshots" (
  "id", "publication_record_id", "observed_at", "views", "reach", "likes", "comments", "saves", "shares", "total_interactions", "created_at"
)
SELECT gen_random_uuid(), "publication_record_id", "observed_at", "views", "reach", "likes", "comments", "saves", "shares", "total_interactions", "created_at"
FROM "publication_metrics"
WHERE "source" = 'instagram_api';
