CREATE TABLE "creative_reference_batches" (
    "id" UUID NOT NULL,
    "content_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "platform" TEXT NOT NULL,
    "style" TEXT NOT NULL,
    "mood" TEXT NOT NULL,
    "requested_aspect_ratio" TEXT NOT NULL,
    "actual_generated_size" TEXT NOT NULL,
    "additional_instruction" VARCHAR(500),
    "status" TEXT NOT NULL,
    "concept_planner_ai_request_log_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "creative_reference_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "creative_reference_batches_platform_check" CHECK ("platform" IN ('instagram', 'linkedin')),
    CONSTRAINT "creative_reference_batches_status_check" CHECK ("status" IN ('pending', 'completed', 'partial', 'failed')),
    CONSTRAINT "creative_reference_batches_aspect_check" CHECK ("requested_aspect_ratio" IN ('portrait_4_5', 'square_1_1', 'landscape')),
    CONSTRAINT "creative_reference_batches_size_check" CHECK ("actual_generated_size" IN ('1024x1536', '1024x1024', '1536x1024'))
);

CREATE TABLE "creative_references" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "concept_index" INTEGER NOT NULL,
    "concept_name" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "layout_notes" TEXT NOT NULL,
    "visual_focus" TEXT NOT NULL,
    "typography_direction" TEXT NOT NULL,
    "image_prompt" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "image_ai_request_log_id" UUID,
    "selected_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creative_references_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "creative_references_concept_index_check" CHECK ("concept_index" BETWEEN 0 AND 2),
    CONSTRAINT "creative_references_file_size_check" CHECK ("file_size" > 0),
    CONSTRAINT "creative_references_mime_type_check" CHECK ("mime_type" = 'image/png')
);

CREATE INDEX "creative_reference_batches_company_id_content_id_platform_created_at_idx" ON "creative_reference_batches"("company_id", "content_id", "platform", "created_at");
CREATE INDEX "creative_reference_batches_content_id_platform_created_at_idx" ON "creative_reference_batches"("content_id", "platform", "created_at");
CREATE UNIQUE INDEX "creative_references_storage_key_key" ON "creative_references"("storage_key");
CREATE UNIQUE INDEX "creative_references_batch_id_concept_index_key" ON "creative_references"("batch_id", "concept_index");
CREATE INDEX "creative_references_batch_id_selected_at_idx" ON "creative_references"("batch_id", "selected_at");

ALTER TABLE "creative_reference_batches" ADD CONSTRAINT "creative_reference_batches_content_id_fkey"
  FOREIGN KEY ("content_id") REFERENCES "contents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "creative_reference_batches" ADD CONSTRAINT "creative_reference_batches_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "creative_reference_batches" ADD CONSTRAINT "creative_reference_batches_concept_planner_ai_request_log_id_fkey"
  FOREIGN KEY ("concept_planner_ai_request_log_id") REFERENCES "ai_request_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "creative_references" ADD CONSTRAINT "creative_references_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "creative_reference_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "creative_references" ADD CONSTRAINT "creative_references_image_ai_request_log_id_fkey"
  FOREIGN KEY ("image_ai_request_log_id") REFERENCES "ai_request_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
