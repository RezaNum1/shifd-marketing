-- Phase 4: persistent editorial workflow foundations. This migration is
-- forward-only and intentionally excludes assets, AI, approval, schedules,
-- publication, and performance domains.

CREATE TABLE "content_ideas" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "context_type" TEXT NOT NULL,
    "product_id" UUID,
    "pillar_code" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "target_audience" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "content_ideas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "content_ideas_context_product_check" CHECK (
      ("context_type" = 'company' AND "product_id" IS NULL) OR
      ("context_type" = 'product' AND "product_id" IS NOT NULL)
    ),
    CONSTRAINT "content_ideas_context_type_check" CHECK ("context_type" IN ('company', 'product')),
    CONSTRAINT "content_ideas_objective_check" CHECK ("objective" IN ('awareness', 'education', 'engagement', 'credibility', 'consideration', 'discovery')),
    CONSTRAINT "content_ideas_status_check" CHECK ("status" IN ('ready', 'used', 'archived')),
    CONSTRAINT "content_ideas_title_nonblank_check" CHECK (btrim("title") <> ''),
    CONSTRAINT "content_ideas_version_check" CHECK ("version" > 0),
    CONSTRAINT "content_ideas_company_id_id_key" UNIQUE ("company_id", "id")
);

CREATE INDEX "content_ideas_company_id_updated_at_id_idx" ON "content_ideas"("company_id", "updated_at" DESC, "id" DESC);
CREATE INDEX "content_ideas_company_id_status_updated_at_id_idx" ON "content_ideas"("company_id", "status", "updated_at" DESC, "id" DESC);
CREATE INDEX "content_ideas_product_id_idx" ON "content_ideas"("product_id");
CREATE INDEX "content_ideas_pillar_code_idx" ON "content_ideas"("pillar_code");
CREATE INDEX "content_ideas_created_by_idx" ON "content_ideas"("created_by");

CREATE TABLE "contents" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "source_idea_id" UUID,
    "context_type" TEXT NOT NULL,
    "product_id" UUID,
    "editorial_stage" TEXT NOT NULL DEFAULT 'draft',
    "editorial_revision" INTEGER NOT NULL DEFAULT 1,
    "master_revision" INTEGER NOT NULL DEFAULT 0,
    "design_status" TEXT NOT NULL DEFAULT 'not_started',
    "archived_at" TIMESTAMPTZ(3),
    "created_by" UUID NOT NULL,
    "master_content" JSONB,
    "visual_direction" JSONB,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "contents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "contents_context_product_check" CHECK (
      ("context_type" = 'company' AND "product_id" IS NULL) OR
      ("context_type" = 'product' AND "product_id" IS NOT NULL)
    ),
    CONSTRAINT "contents_context_type_check" CHECK ("context_type" IN ('company', 'product')),
    CONSTRAINT "contents_editorial_stage_check" CHECK ("editorial_stage" IN ('draft', 'generated', 'adapted', 'creative_in_progress', 'ready_for_review', 'needs_revision')),
    CONSTRAINT "contents_design_status_check" CHECK ("design_status" IN ('not_started', 'in_progress', 'ready')),
    CONSTRAINT "contents_editorial_revision_check" CHECK ("editorial_revision" > 0),
    CONSTRAINT "contents_master_revision_check" CHECK ("master_revision" >= 0),
    CONSTRAINT "contents_version_check" CHECK ("version" > 0),
    CONSTRAINT "contents_company_id_id_key" UNIQUE ("company_id", "id")
);

CREATE INDEX "contents_company_id_updated_at_id_idx" ON "contents"("company_id", "updated_at" DESC, "id" DESC);
CREATE INDEX "contents_company_id_editorial_stage_updated_at_id_idx" ON "contents"("company_id", "editorial_stage", "updated_at" DESC, "id" DESC);
CREATE INDEX "contents_product_id_idx" ON "contents"("product_id");
CREATE INDEX "contents_source_idea_id_idx" ON "contents"("source_idea_id");
CREATE INDEX "contents_created_by_idx" ON "contents"("created_by");

CREATE TABLE "content_briefs" (
    "content_id" UUID NOT NULL,
    "pillar_code" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "target_audience" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "angle" TEXT,
    "additional_instructions" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "content_briefs_pkey" PRIMARY KEY ("content_id"),
    CONSTRAINT "content_briefs_objective_check" CHECK ("objective" IN ('awareness', 'education', 'engagement', 'credibility', 'consideration', 'discovery')),
    CONSTRAINT "content_briefs_target_audience_nonblank_check" CHECK (btrim("target_audience") <> ''),
    CONSTRAINT "content_briefs_topic_nonblank_check" CHECK (btrim("topic") <> ''),
    CONSTRAINT "content_briefs_version_check" CHECK ("version" > 0)
);

CREATE INDEX "content_briefs_pillar_code_idx" ON "content_briefs"("pillar_code");

CREATE TABLE "platform_variants" (
    "id" UUID NOT NULL,
    "content_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "copy" TEXT,
    "cta" TEXT,
    "hashtags" TEXT,
    "visual_recommendation" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "adapted_from_master_revision" INTEGER,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_variants_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "platform_variants_platform_check" CHECK ("platform" IN ('instagram', 'linkedin')),
    CONSTRAINT "platform_variants_revision_check" CHECK ("revision" > 0),
    CONSTRAINT "platform_variants_adapted_revision_check" CHECK ("adapted_from_master_revision" IS NULL OR "adapted_from_master_revision" >= 0),
    CONSTRAINT "platform_variants_content_id_platform_key" UNIQUE ("content_id", "platform"),
    CONSTRAINT "platform_variants_content_id_id_key" UNIQUE ("content_id", "id")
);

CREATE INDEX "platform_variants_content_id_idx" ON "platform_variants"("content_id");

CREATE TABLE "content_events" (
    "id" UUID NOT NULL,
    "content_id" UUID NOT NULL,
    "variant_id" UUID,
    "actor_id" UUID,
    "actor_kind" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "request_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "content_events_actor_kind_check" CHECK ("actor_kind" IN ('user', 'system')),
    CONSTRAINT "content_events_user_actor_check" CHECK ("actor_kind" <> 'user' OR "actor_id" IS NOT NULL),
    CONSTRAINT "content_events_event_type_check" CHECK ("event_type" IN ('brief_created', 'content_updated', 'variant_updated', 'progress_changed', 'content_duplicated', 'content_archived'))
);

CREATE INDEX "content_events_content_id_created_at_id_idx" ON "content_events"("content_id", "created_at" DESC, "id" DESC);
CREATE INDEX "content_events_variant_id_idx" ON "content_events"("variant_id");
CREATE INDEX "content_events_actor_id_idx" ON "content_events"("actor_id");

ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_company_product_fkey" FOREIGN KEY ("company_id", "product_id") REFERENCES "products"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_pillar_code_fkey" FOREIGN KEY ("pillar_code") REFERENCES "content_pillars"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "contents" ADD CONSTRAINT "contents_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contents" ADD CONSTRAINT "contents_source_idea_id_fkey" FOREIGN KEY ("source_idea_id") REFERENCES "content_ideas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contents" ADD CONSTRAINT "contents_company_source_idea_fkey" FOREIGN KEY ("company_id", "source_idea_id") REFERENCES "content_ideas"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contents" ADD CONSTRAINT "contents_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contents" ADD CONSTRAINT "contents_company_product_fkey" FOREIGN KEY ("company_id", "product_id") REFERENCES "products"("company_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contents" ADD CONSTRAINT "contents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "content_briefs" ADD CONSTRAINT "content_briefs_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_briefs" ADD CONSTRAINT "content_briefs_pillar_code_fkey" FOREIGN KEY ("pillar_code") REFERENCES "content_pillars"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "platform_variants" ADD CONSTRAINT "platform_variants_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "content_events" ADD CONSTRAINT "content_events_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_events" ADD CONSTRAINT "content_events_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "platform_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_events" ADD CONSTRAINT "content_events_content_variant_fkey" FOREIGN KEY ("content_id", "variant_id") REFERENCES "platform_variants"("content_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "content_events" ADD CONSTRAINT "content_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
