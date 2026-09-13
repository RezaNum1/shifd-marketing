-- Phase 5: private immutable Asset metadata and ordered Variant attachments.
-- Forward-only; no Phase 1-4 migration is edited and no future domain tables
-- are introduced.

CREATE TABLE "creative_assets" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "checksum_sha256" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'ready',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "creative_assets_purpose_check" CHECK ("purpose" IN ('creative', 'metric_evidence')),
    CONSTRAINT "creative_assets_mime_type_check" CHECK ("mime_type" IN ('image/png', 'image/jpeg')),
    CONSTRAINT "creative_assets_state_check" CHECK ("state" IN ('ready', 'pending_delete')),
    CONSTRAINT "creative_assets_file_name_nonblank_check" CHECK (btrim("file_name") <> ''),
    CONSTRAINT "creative_assets_storage_key_nonblank_check" CHECK (btrim("storage_key") <> ''),
    CONSTRAINT "creative_assets_size_bytes_check" CHECK ("size_bytes" > 0),
    CONSTRAINT "creative_assets_width_check" CHECK ("width" > 0),
    CONSTRAINT "creative_assets_height_check" CHECK ("height" > 0),
    CONSTRAINT "creative_assets_checksum_sha256_check" CHECK ("checksum_sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "creative_assets_storage_key_key" UNIQUE ("storage_key")
);

CREATE INDEX "creative_assets_company_id_created_at_idx" ON "creative_assets"("company_id", "created_at" DESC);

ALTER TABLE "platform_variants" ADD COLUMN "reuse_creative_from_variant_id" UUID;
ALTER TABLE "platform_variants" ADD CONSTRAINT "platform_variants_reuse_not_self_check"
  CHECK ("reuse_creative_from_variant_id" IS NULL OR "reuse_creative_from_variant_id" <> "id");
ALTER TABLE "platform_variants" ADD CONSTRAINT "platform_variants_reuse_same_content_fkey"
  FOREIGN KEY ("content_id", "reuse_creative_from_variant_id")
  REFERENCES "platform_variants"("content_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "variant_assets" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variant_assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "variant_assets_sort_order_check" CHECK ("sort_order" >= 0),
    CONSTRAINT "variant_assets_variant_id_asset_id_key" UNIQUE ("variant_id", "asset_id"),
    CONSTRAINT "variant_assets_variant_id_sort_order_key" UNIQUE ("variant_id", "sort_order")
);

CREATE INDEX "variant_assets_asset_id_idx" ON "variant_assets"("asset_id");

ALTER TABLE "creative_assets" ADD CONSTRAINT "creative_assets_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "creative_assets" ADD CONSTRAINT "creative_assets_uploaded_by_fkey"
  FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "variant_assets" ADD CONSTRAINT "variant_assets_variant_id_fkey"
  FOREIGN KEY ("variant_id") REFERENCES "platform_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "variant_assets" ADD CONSTRAINT "variant_assets_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "creative_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
