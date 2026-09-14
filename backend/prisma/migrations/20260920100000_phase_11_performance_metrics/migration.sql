-- Phase 11: account-level performance observations, supplementary inquiries,
-- and the explicit integration/source boundary. No post-level metrics,
-- publishing provider, worker, queue, or CRM tables are introduced.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE "social_accounts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "account_name" TEXT,
    "external_account_id" TEXT,
    "mode" TEXT NOT NULL,
    "connection_status" TEXT NOT NULL,
    "reporting_timezone" TEXT NOT NULL,
    "last_successful_sync_at" TIMESTAMPTZ(3),
    "credential_reference" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "social_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "social_accounts_platform_check" CHECK ("platform" IN ('instagram', 'linkedin', 'whatsapp')),
    CONSTRAINT "social_accounts_mode_check" CHECK ("mode" IN ('demo', 'manual', 'api')),
    CONSTRAINT "social_accounts_connection_status_check" CHECK ("connection_status" IN ('connected', 'disconnected', 'manual')),
    CONSTRAINT "social_accounts_timezone_check" CHECK (btrim("reporting_timezone") <> ''),
    CONSTRAINT "social_accounts_version_check" CHECK ("version" > 0),
    CONSTRAINT "social_accounts_company_platform_key" UNIQUE ("company_id", "platform")
);

CREATE INDEX "social_accounts_company_platform_idx"
  ON "social_accounts"("company_id", "platform");

ALTER TABLE "social_accounts"
  ADD CONSTRAINT "social_accounts_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "weekly_metrics" (
    "id" UUID NOT NULL,
    "social_account_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "week_end" DATE NOT NULL,
    "followers" BIGINT NOT NULL,
    "reach" BIGINT,
    "impressions" BIGINT NOT NULL,
    "likes" BIGINT NOT NULL DEFAULT 0,
    "comments" BIGINT NOT NULL DEFAULT 0,
    "saves" BIGINT NOT NULL DEFAULT 0,
    "reported_published_posts" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "evidence_asset_id" UUID,
    "notes" TEXT,
    "recorded_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "weekly_metrics_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "weekly_metrics_source_check" CHECK ("source" IN ('mock', 'linkedin_manual', 'instagram_api')),
    CONSTRAINT "weekly_metrics_week_order_check" CHECK ("week_end" >= "week_start"),
    CONSTRAINT "weekly_metrics_followers_check" CHECK ("followers" >= 0),
    CONSTRAINT "weekly_metrics_reach_check" CHECK ("reach" IS NULL OR "reach" >= 0),
    CONSTRAINT "weekly_metrics_impressions_check" CHECK ("impressions" >= 0),
    CONSTRAINT "weekly_metrics_likes_check" CHECK ("likes" >= 0),
    CONSTRAINT "weekly_metrics_comments_check" CHECK ("comments" >= 0),
    CONSTRAINT "weekly_metrics_saves_check" CHECK ("saves" >= 0),
    CONSTRAINT "weekly_metrics_reported_posts_check" CHECK ("reported_published_posts" >= 0),
    CONSTRAINT "weekly_metrics_version_check" CHECK ("version" > 0),
    CONSTRAINT "weekly_metrics_account_interval_key" UNIQUE ("social_account_id", "week_start", "week_end"),
    CONSTRAINT "weekly_metrics_account_interval_no_overlap"
      EXCLUDE USING gist (
        "social_account_id" WITH =,
        (daterange("week_start", ("week_end" + 1), '[)')) WITH &&
      )
);

CREATE INDEX "weekly_metrics_account_week_start_idx"
  ON "weekly_metrics"("social_account_id", "week_start");
CREATE INDEX "weekly_metrics_evidence_asset_idx"
  ON "weekly_metrics"("evidence_asset_id");

ALTER TABLE "weekly_metrics"
  ADD CONSTRAINT "weekly_metrics_social_account_id_fkey"
  FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "weekly_metrics"
  ADD CONSTRAINT "weekly_metrics_evidence_asset_id_fkey"
  FOREIGN KEY ("evidence_asset_id") REFERENCES "creative_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "weekly_metrics"
  ADD CONSTRAINT "weekly_metrics_recorded_by_fkey"
  FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "inbound_inquiry_metrics" (
    "id" UUID NOT NULL,
    "social_account_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "week_end" DATE NOT NULL,
    "count" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "recorded_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "inbound_inquiry_metrics_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inbound_inquiry_metrics_source_check" CHECK ("source" IN ('mock', 'manual')),
    CONSTRAINT "inbound_inquiry_metrics_week_order_check" CHECK ("week_end" >= "week_start"),
    CONSTRAINT "inbound_inquiry_metrics_count_check" CHECK ("count" >= 0),
    CONSTRAINT "inbound_inquiry_metrics_version_check" CHECK ("version" > 0),
    CONSTRAINT "inbound_inquiry_metrics_account_interval_key" UNIQUE ("social_account_id", "week_start", "week_end"),
    CONSTRAINT "inbound_inquiry_metrics_account_interval_no_overlap"
      EXCLUDE USING gist (
        "social_account_id" WITH =,
        (daterange("week_start", ("week_end" + 1), '[)')) WITH &&
      )
);

CREATE INDEX "inbound_inquiry_metrics_account_week_start_idx"
  ON "inbound_inquiry_metrics"("social_account_id", "week_start");

ALTER TABLE "inbound_inquiry_metrics"
  ADD CONSTRAINT "inbound_inquiry_metrics_social_account_id_fkey"
  FOREIGN KEY ("social_account_id") REFERENCES "social_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inbound_inquiry_metrics"
  ADD CONSTRAINT "inbound_inquiry_metrics_recorded_by_fkey"
  FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing companies receive only source configuration rows. No metric values
-- are seeded, and Instagram is explicitly a disconnected demo boundary until
-- a real provider is configured.
INSERT INTO "social_accounts"
  ("id", "company_id", "platform", "mode", "connection_status", "reporting_timezone")
SELECT gen_random_uuid(), c."id", 'instagram', 'demo', 'disconnected', c."reporting_timezone"
FROM "companies" AS c
ON CONFLICT ("company_id", "platform") DO NOTHING;

INSERT INTO "social_accounts"
  ("id", "company_id", "platform", "mode", "connection_status", "reporting_timezone")
SELECT gen_random_uuid(), c."id", p."platform", 'manual', 'manual', c."reporting_timezone"
FROM "companies" AS c
CROSS JOIN (VALUES ('linkedin'), ('whatsapp')) AS p("platform")
ON CONFLICT ("company_id", "platform") DO NOTHING;
