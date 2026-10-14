CREATE TABLE "content_canva_design_links" (
  "company_id" UUID NOT NULL,
  "content_id" UUID NOT NULL,
  "url" VARCHAR(2048),
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "content_canva_design_links_pkey" PRIMARY KEY ("company_id", "content_id"),
  CONSTRAINT "content_canva_design_links_url_length_check" CHECK ("url" IS NULL OR char_length("url") <= 2048),
  CONSTRAINT "content_canva_design_links_canva_https_check" CHECK ("url" IS NULL OR "url" ~ '^https://(www\.)?canva\.com/design/[A-Za-z0-9_-]+(/|$)'),
  CONSTRAINT "content_canva_design_links_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "content_canva_design_links_company_content_fkey" FOREIGN KEY ("company_id", "content_id") REFERENCES "contents"("company_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "content_canva_design_links_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "content_canva_design_links_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "content_canva_design_links_content_id_idx" ON "content_canva_design_links"("content_id");
