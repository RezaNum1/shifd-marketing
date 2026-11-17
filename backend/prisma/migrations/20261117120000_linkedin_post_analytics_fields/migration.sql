ALTER TABLE "publication_metrics"
  ADD COLUMN "impressions" BIGINT,
  ADD COLUMN "impressions_in_network" DECIMAL(5, 2),
  ADD COLUMN "impressions_out_of_network" DECIMAL(5, 2),
  ADD COLUMN "member_reached" BIGINT,
  ADD COLUMN "followers_gained" BIGINT,
  ADD COLUMN "profile_viewers" BIGINT,
  ADD COLUMN "reactions" BIGINT;

ALTER TABLE "publication_metric_snapshots"
  ADD COLUMN "impressions" BIGINT,
  ADD COLUMN "impressions_in_network" DECIMAL(5, 2),
  ADD COLUMN "impressions_out_of_network" DECIMAL(5, 2),
  ADD COLUMN "member_reached" BIGINT,
  ADD COLUMN "followers_gained" BIGINT,
  ADD COLUMN "profile_viewers" BIGINT,
  ADD COLUMN "reactions" BIGINT;

ALTER TABLE "publication_metrics"
  ADD CONSTRAINT "publication_metrics_linkedin_counts_check" CHECK (
    ("impressions" IS NULL OR "impressions" >= 0) AND
    ("impressions_in_network" IS NULL OR "impressions_in_network" BETWEEN 0 AND 100) AND
    ("impressions_out_of_network" IS NULL OR "impressions_out_of_network" BETWEEN 0 AND 100) AND
    ("member_reached" IS NULL OR "member_reached" >= 0) AND
    ("followers_gained" IS NULL OR "followers_gained" >= 0) AND
    ("profile_viewers" IS NULL OR "profile_viewers" >= 0) AND
    ("reactions" IS NULL OR "reactions" >= 0)
  );

ALTER TABLE "publication_metric_snapshots"
  ADD CONSTRAINT "publication_metric_snapshots_linkedin_counts_check" CHECK (
    ("impressions" IS NULL OR "impressions" >= 0) AND
    ("impressions_in_network" IS NULL OR "impressions_in_network" BETWEEN 0 AND 100) AND
    ("impressions_out_of_network" IS NULL OR "impressions_out_of_network" BETWEEN 0 AND 100) AND
    ("member_reached" IS NULL OR "member_reached" >= 0) AND
    ("followers_gained" IS NULL OR "followers_gained" >= 0) AND
    ("profile_viewers" IS NULL OR "profile_viewers" >= 0) AND
    ("reactions" IS NULL OR "reactions" >= 0)
  );

UPDATE "publication_metrics"
SET "member_reached" = "reach", "reactions" = "likes"
WHERE "source" = 'linkedin_manual';

UPDATE "publication_metric_snapshots" AS snapshots
SET "member_reached" = snapshots."reach", "reactions" = snapshots."likes"
WHERE EXISTS (
  SELECT 1 FROM "publication_metrics" AS metrics
  WHERE metrics."publication_record_id" = snapshots."publication_record_id"
    AND metrics."source" = 'linkedin_manual'
);
