ALTER TABLE "creative_references"
  ADD COLUMN "template_type" TEXT,
  ADD COLUMN "slide_number" INTEGER,
  ADD COLUMN "slide_copy" TEXT,
  ADD COLUMN "canva_brief" TEXT,
  ADD COLUMN "asset_search_keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "carousel_outline" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "creative_reference_batches"
  ADD COLUMN "creative_format" TEXT NOT NULL DEFAULT 'single_image',
  ADD COLUMN "expected_reference_count" INTEGER NOT NULL DEFAULT 3;
