-- General-topic content does not require a Company or Product context.
-- Keep the database checks aligned with the API's supported context types.

ALTER TABLE "content_ideas"
  DROP CONSTRAINT "content_ideas_context_product_check",
  DROP CONSTRAINT "content_ideas_context_type_check";

ALTER TABLE "content_ideas"
  ADD CONSTRAINT "content_ideas_context_product_check" CHECK (
    ("context_type" IN ('company', 'general') AND "product_id" IS NULL) OR
    ("context_type" = 'product' AND "product_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "content_ideas_context_type_check" CHECK (
    "context_type" IN ('company', 'product', 'general')
  );

ALTER TABLE "contents"
  DROP CONSTRAINT "contents_context_product_check",
  DROP CONSTRAINT "contents_context_type_check";

ALTER TABLE "contents"
  ADD CONSTRAINT "contents_context_product_check" CHECK (
    ("context_type" IN ('company', 'general') AND "product_id" IS NULL) OR
    ("context_type" = 'product' AND "product_id" IS NOT NULL)
  ),
  ADD CONSTRAINT "contents_context_type_check" CHECK (
    "context_type" IN ('company', 'product', 'general')
  );
