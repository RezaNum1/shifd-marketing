-- Phase 3: deterministic Company and Product Context persistence.
-- This migration is forward-only and does not alter existing company fields.

CREATE TABLE "brand_profiles" (
    "company_id" UUID NOT NULL,
    "brand_voice" TEXT,
    "tone_description" TEXT,
    "preferred_language" TEXT NOT NULL DEFAULT 'English',
    "communication_guidelines" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "preferred_terms" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "things_to_avoid" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "cta_style" TEXT,
    "brand_keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "brand_profiles_pkey" PRIMARY KEY ("company_id"),
    CONSTRAINT "brand_profiles_preferred_language_check" CHECK ("preferred_language" IN ('English', 'Indonesian')),
    CONSTRAINT "brand_profiles_version_check" CHECK ("version" > 0)
);

CREATE TABLE "bmc_blocks" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "entries" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "bmc_blocks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "bmc_blocks_type_check" CHECK ("type" IN ('key-partners', 'key-activities', 'key-resources', 'value-propositions', 'customer-relationships', 'channels', 'customer-segments', 'cost-structure', 'revenue-streams')),
    CONSTRAINT "bmc_blocks_version_check" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "bmc_blocks_company_id_type_key" ON "bmc_blocks"("company_id", "type");
CREATE INDEX "bmc_blocks_company_id_idx" ON "bmc_blocks"("company_id");

CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "status" TEXT NOT NULL,
    "url" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "products_status_check" CHECK ("status" IN ('active', 'inactive', 'draft')),
    CONSTRAINT "products_version_check" CHECK ("version" > 0)
);

CREATE UNIQUE INDEX "products_company_id_slug_key" ON "products"("company_id", "slug");
CREATE UNIQUE INDEX "products_company_id_id_key" ON "products"("company_id", "id");
CREATE INDEX "products_company_id_status_idx" ON "products"("company_id", "status");

CREATE TABLE "product_profiles" (
    "product_id" UUID NOT NULL,
    "target_users" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "target_organizations" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "decision_makers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "problems_addressed" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "value_proposition" TEXT,
    "features" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "benefits" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "differentiators" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "use_cases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "campaign_objective" TEXT,
    "positioning" TEXT,
    "key_messages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "proof_points" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "default_cta" TEXT,
    "inherit_company_tone" BOOLEAN NOT NULL DEFAULT true,
    "tone_override" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "product_profiles_pkey" PRIMARY KEY ("product_id"),
    CONSTRAINT "product_profiles_campaign_objective_check" CHECK ("campaign_objective" IS NULL OR "campaign_objective" IN ('awareness', 'education', 'engagement', 'credibility', 'consideration', 'discovery')),
    CONSTRAINT "product_profiles_version_check" CHECK ("version" > 0)
);

CREATE TABLE "content_pillars" (
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "content_pillars_pkey" PRIMARY KEY ("code"),
    CONSTRAINT "content_pillars_label_key" UNIQUE ("label"),
    CONSTRAINT "content_pillars_sort_order_key" UNIQUE ("sort_order")
);

-- This is the only additional table in Phase 3: it is the minimal durable
-- boundary needed for the contract's Product creation Idempotency-Key.
CREATE TABLE "request_idempotency" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "operation" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB NOT NULL,
    "resource_id" UUID NOT NULL,
    "response_etag" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_idempotency_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "request_idempotency_company_operation_key_key" ON "request_idempotency"("company_id", "operation", "key");
CREATE INDEX "request_idempotency_company_id_created_at_idx" ON "request_idempotency"("company_id", "created_at");

ALTER TABLE "brand_profiles" ADD CONSTRAINT "brand_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bmc_blocks" ADD CONSTRAINT "bmc_blocks_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "product_profiles" ADD CONSTRAINT "product_profiles_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "request_idempotency" ADD CONSTRAINT "request_idempotency_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing Phase 2 companies receive empty, honest context rows. Re-running
-- the command is safe and never overwrites company-entered values.
INSERT INTO "brand_profiles" ("company_id")
SELECT "id" FROM "companies"
ON CONFLICT ("company_id") DO NOTHING;

INSERT INTO "bmc_blocks" ("id", "company_id", "type")
SELECT gen_random_uuid(), c."id", block."type"
FROM "companies" c
CROSS JOIN (VALUES
  ('key-partners'), ('key-activities'), ('key-resources'),
  ('value-propositions'), ('customer-relationships'), ('channels'),
  ('customer-segments'), ('cost-structure'), ('revenue-streams')
) AS block("type")
ON CONFLICT ("company_id", "type") DO NOTHING;

INSERT INTO "content_pillars" ("code", "label", "sort_order") VALUES
  ('educational', 'Educational', 1),
  ('problem', 'Problem / Pain Point', 2),
  ('product', 'Product Insight', 3),
  ('use-case', 'Use Case', 4),
  ('industry', 'Industry Insight', 5),
  ('thought-leadership', 'Thought Leadership', 6),
  ('company', 'Company / Brand', 7)
ON CONFLICT ("code") DO UPDATE SET "label" = EXCLUDED."label", "sort_order" = EXCLUDED."sort_order", "active" = true;
