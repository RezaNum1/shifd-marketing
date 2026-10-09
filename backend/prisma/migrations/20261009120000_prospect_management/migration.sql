CREATE TABLE "prospects" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "industry" TEXT,
  "website" TEXT,
  "address" TEXT,
  "employee_count" INTEGER,
  "employee_size" TEXT,
  "contact_name" TEXT,
  "contact_email" TEXT,
  "contact_phone" TEXT,
  "notes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'lead',
  "source" TEXT NOT NULL DEFAULT 'manual',
  "archived_at" TIMESTAMPTZ(3),
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "version" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "prospects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prospects_company_id_id_key" UNIQUE ("company_id", "id"),
  CONSTRAINT "prospects_employee_count_check" CHECK ("employee_count" IS NULL OR "employee_count" >= 0),
  CONSTRAINT "prospects_status_check" CHECK ("status" IN ('lead', 'qualified', 'customer', 'disqualified')),
  CONSTRAINT "prospects_source_check" CHECK ("source" IN ('manual', 'excel_import')),
  CONSTRAINT "prospects_name_length_check" CHECK (char_length(btrim("name")) BETWEEN 1 AND 240),
  CONSTRAINT "prospects_version_check" CHECK ("version" > 0)
);

CREATE INDEX "prospects_company_archive_updated_idx" ON "prospects"("company_id", "archived_at", "updated_at" DESC, "id" DESC);
CREATE INDEX "prospects_company_industry_status_idx" ON "prospects"("company_id", "industry", "status");
CREATE INDEX "prospects_company_creator_idx" ON "prospects"("company_id", "created_by");

ALTER TABLE "prospects" ADD CONSTRAINT "prospects_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
