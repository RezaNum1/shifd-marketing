ALTER TABLE "prospects"
  ADD COLUMN "normalized_name" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "normalized_domain" TEXT,
  ADD COLUMN "import_fingerprint" TEXT,
  ADD COLUMN "import_batch_id" UUID;

UPDATE "prospects"
SET "normalized_name" = lower(btrim("name"));
ALTER TABLE "prospects" ALTER COLUMN "normalized_name" DROP DEFAULT;

CREATE INDEX "prospects_company_normalized_name_idx" ON "prospects"("company_id", "normalized_name");
CREATE INDEX "prospects_company_import_fingerprint_idx" ON "prospects"("company_id", "import_fingerprint");
CREATE INDEX "prospects_import_batch_id_idx" ON "prospects"("import_batch_id");
CREATE UNIQUE INDEX "prospects_company_active_domain_key"
  ON "prospects"("company_id", "normalized_domain")
  WHERE "normalized_domain" IS NOT NULL AND "archived_at" IS NULL;
CREATE UNIQUE INDEX "prospects_company_import_fingerprint_key"
  ON "prospects"("company_id", "import_fingerprint")
  WHERE "import_fingerprint" IS NOT NULL;

CREATE TABLE "prospect_import_batches" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "created_by" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "file_digest" TEXT NOT NULL,
  "preview" JSONB NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "confirmed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "prospect_import_batches_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prospect_import_batches_token_hash_key" UNIQUE ("token_hash"),
  CONSTRAINT "prospect_import_batches_preview_check" CHECK (jsonb_typeof("preview") = 'object'),
  CONSTRAINT "prospect_import_batches_expiry_check" CHECK ("expires_at" > "created_at")
);

CREATE INDEX "prospect_import_batches_company_expires_idx" ON "prospect_import_batches"("company_id", "expires_at");
CREATE INDEX "prospect_import_batches_creator_expires_idx" ON "prospect_import_batches"("created_by", "expires_at");

ALTER TABLE "prospect_import_batches" ADD CONSTRAINT "prospect_import_batches_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prospect_import_batches" ADD CONSTRAINT "prospect_import_batches_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_import_batch_id_fkey"
  FOREIGN KEY ("import_batch_id") REFERENCES "prospect_import_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
