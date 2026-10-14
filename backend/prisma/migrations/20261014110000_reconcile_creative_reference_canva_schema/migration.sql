-- Reconcile databases where the first Canva brief migration was recorded as
-- applied before all of its schema changes were present.
ALTER TABLE "creative_reference_batches"
  ADD COLUMN IF NOT EXISTS "creative_format" TEXT NOT NULL DEFAULT 'single_image',
  ADD COLUMN IF NOT EXISTS "expected_reference_count" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "creative_references"
  ADD COLUMN IF NOT EXISTS "template_type" TEXT,
  ADD COLUMN IF NOT EXISTS "slide_number" INTEGER,
  ADD COLUMN IF NOT EXISTS "slide_copy" TEXT,
  ADD COLUMN IF NOT EXISTS "canva_brief" TEXT,
  ADD COLUMN IF NOT EXISTS "asset_search_keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "carousel_outline" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
