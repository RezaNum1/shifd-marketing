/*
  Warnings:

  - A unique constraint covering the columns `[company_id,id]` on the table `outbound_activities` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[ai_request_id]` on the table `request_idempotency` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "ai_request_logs" DROP CONSTRAINT "ai_request_logs_content_variant_fkey";

-- DropForeignKey
ALTER TABLE "content_events" DROP CONSTRAINT "content_events_content_variant_fkey";

-- DropForeignKey
ALTER TABLE "content_ideas" DROP CONSTRAINT "content_ideas_company_product_fkey";

-- DropForeignKey
ALTER TABLE "contents" DROP CONSTRAINT "contents_company_product_fkey";

-- DropForeignKey
ALTER TABLE "contents" DROP CONSTRAINT "contents_company_source_idea_fkey";

-- DropForeignKey
ALTER TABLE "contents" DROP CONSTRAINT "contents_current_approval_fkey";

-- DropForeignKey
ALTER TABLE "platform_variants" DROP CONSTRAINT "platform_variants_current_assessment_fkey";

-- DropForeignKey
ALTER TABLE "publication_records" DROP CONSTRAINT "publication_records_schedule_variant_fkey";

-- DropIndex
DROP INDEX "ai_request_logs_company_id_created_at_id_idx";

-- DropIndex
DROP INDEX "ai_request_logs_content_id_created_at_idx";

-- DropIndex
DROP INDEX "approval_actions_content_id_created_at_id_idx";

-- DropIndex
DROP INDEX "brand_assessments_variant_id_created_at_idx";

-- DropIndex
DROP INDEX "content_events_content_id_created_at_id_idx";

-- DropIndex
DROP INDEX "content_ideas_company_id_status_updated_at_id_idx";

-- DropIndex
DROP INDEX "content_ideas_company_id_updated_at_id_idx";

-- DropIndex
DROP INDEX "content_ideas_company_target_industry_idx";

-- DropIndex
DROP INDEX "content_ideas_company_target_prospect_idx";

-- DropIndex
DROP INDEX "contents_company_id_editorial_stage_updated_at_id_idx";

-- DropIndex
DROP INDEX "contents_company_id_updated_at_id_idx";

-- DropIndex
DROP INDEX "contents_company_target_industry_idx";

-- DropIndex
DROP INDEX "contents_company_target_prospect_idx";

-- DropIndex
DROP INDEX "creative_assets_company_id_created_at_idx";

-- DropIndex
DROP INDEX "prospects_company_archive_updated_idx";

-- DropIndex
DROP INDEX "topic_candidates_company_created_idx";

-- DropIndex
DROP INDEX "topic_discovery_runs_company_created_idx";

-- DropIndex
DROP INDEX "topic_discovery_runs_company_status_created_idx";

-- AlterTable
ALTER TABLE "ai_settings" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "content_briefs" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "content_ideas" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "content_schedules" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "contents" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "creative_reference_batches" ALTER COLUMN "additional_instruction" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "creative_references" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "inbound_inquiry_metrics" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "platform_variants" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "prompt_versions" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "prospects" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "publication_metrics" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "publication_records" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "social_accounts" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "weekly_metrics" ALTER COLUMN "updated_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "ai_request_logs_company_id_created_at_id_idx" ON "ai_request_logs"("company_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "ai_request_logs_content_id_created_at_idx" ON "ai_request_logs"("content_id", "created_at");

-- CreateIndex
CREATE INDEX "approval_actions_content_id_created_at_id_idx" ON "approval_actions"("content_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "brand_assessments_variant_id_created_at_idx" ON "brand_assessments"("variant_id", "created_at");

-- CreateIndex
CREATE INDEX "content_events_content_id_created_at_id_idx" ON "content_events"("content_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "content_ideas_company_id_updated_at_id_idx" ON "content_ideas"("company_id", "updated_at", "id");

-- CreateIndex
CREATE INDEX "content_ideas_company_id_status_updated_at_id_idx" ON "content_ideas"("company_id", "status", "updated_at", "id");

-- CreateIndex
CREATE INDEX "content_schedules_scheduled_at_idx" ON "content_schedules"("scheduled_at");

-- CreateIndex
CREATE INDEX "contents_company_id_updated_at_id_idx" ON "contents"("company_id", "updated_at", "id");

-- CreateIndex
CREATE INDEX "contents_company_id_editorial_stage_updated_at_id_idx" ON "contents"("company_id", "editorial_stage", "updated_at", "id");

-- CreateIndex
CREATE INDEX "creative_assets_company_id_created_at_idx" ON "creative_assets"("company_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_activities_company_id_id_key" ON "outbound_activities"("company_id", "id");

-- CreateIndex
CREATE INDEX "prospects_company_id_archived_at_updated_at_id_idx" ON "prospects"("company_id", "archived_at", "updated_at", "id");

-- Replace the legacy partial unique index with the schema's regular unique index.
DROP INDEX IF EXISTS "request_idempotency_ai_request_id_key";
CREATE UNIQUE INDEX "request_idempotency_ai_request_id_key" ON "request_idempotency"("ai_request_id");

-- CreateIndex
CREATE INDEX "topic_candidates_company_id_created_at_id_idx" ON "topic_candidates"("company_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "topic_discovery_runs_company_id_created_at_id_idx" ON "topic_discovery_runs"("company_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "topic_discovery_runs_company_id_status_created_at_idx" ON "topic_discovery_runs"("company_id", "status", "created_at");

-- RenameForeignKey
ALTER TABLE "approval_actions" RENAME CONSTRAINT "approval_actions_content_variant_fkey" TO "approval_actions_content_id_variant_id_fkey";

-- RenameForeignKey
ALTER TABLE "approval_actions" RENAME CONSTRAINT "approval_actions_variant_assessment_fkey" TO "approval_actions_variant_id_assessment_id_fkey";

-- RenameForeignKey
ALTER TABLE "creative_reference_batches" RENAME CONSTRAINT "creative_reference_batches_concept_planner_ai_request_log_id_fk" TO "creative_reference_batches_concept_planner_ai_request_log__fkey";

-- RenameForeignKey
ALTER TABLE "platform_variants" RENAME CONSTRAINT "platform_variants_reuse_same_content_fkey" TO "platform_variants_content_id_reuse_creative_from_variant_i_fkey";

-- AddForeignKey
ALTER TABLE "contents" ADD CONSTRAINT "contents_current_approval_id_fkey" FOREIGN KEY ("current_approval_id") REFERENCES "approval_actions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_variants" ADD CONSTRAINT "platform_variants_current_assessment_id_fkey" FOREIGN KEY ("current_assessment_id") REFERENCES "brand_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "creative_reference_batches_company_id_content_id_platform_creat" RENAME TO "creative_reference_batches_company_id_content_id_platform_c_idx";

-- RenameIndex
ALTER INDEX "inbound_inquiry_metrics_account_interval_key" RENAME TO "inbound_inquiry_metrics_social_account_id_week_start_week_e_key";

-- RenameIndex
ALTER INDEX "inbound_inquiry_metrics_account_week_start_idx" RENAME TO "inbound_inquiry_metrics_social_account_id_week_start_idx";

-- RenameIndex
ALTER INDEX "outbound_activities_company_id_prospect_id_occurred_at_created_" RENAME TO "outbound_activities_company_id_prospect_id_occurred_at_crea_idx";

-- RenameIndex
ALTER INDEX "prospect_email_drafts_company_id_prospect_id_status_updated_at_" RENAME TO "prospect_email_drafts_company_id_prospect_id_status_updated_idx";

-- RenameIndex
ALTER INDEX "prospect_import_batches_company_expires_idx" RENAME TO "prospect_import_batches_company_id_expires_at_idx";

-- RenameIndex
ALTER INDEX "prospect_import_batches_creator_expires_idx" RENAME TO "prospect_import_batches_created_by_expires_at_idx";

-- RenameIndex
ALTER INDEX "prospect_research_claims_run_type_review_idx" RENAME TO "prospect_research_claims_run_id_claim_type_review_status_idx";

-- RenameIndex
ALTER INDEX "prospect_research_runs_company_prospect_created_idx" RENAME TO "prospect_research_runs_company_id_prospect_id_created_at_idx";

-- RenameIndex
ALTER INDEX "prospect_research_runs_company_status_idx" RENAME TO "prospect_research_runs_company_id_status_idx";

-- RenameIndex
ALTER INDEX "prospects_company_creator_idx" RENAME TO "prospects_company_id_created_by_idx";

-- RenameIndex
ALTER INDEX "prospects_company_import_fingerprint_idx" RENAME TO "prospects_company_id_import_fingerprint_idx";

-- RenameIndex
ALTER INDEX "prospects_company_industry_status_idx" RENAME TO "prospects_company_id_industry_status_idx";

-- RenameIndex
ALTER INDEX "prospects_company_normalized_name_idx" RENAME TO "prospects_company_id_normalized_name_idx";

-- RenameIndex
ALTER INDEX "publication_metrics_account_media_source_key" RENAME TO "publication_metrics_social_account_id_external_media_id_sou_key";

-- RenameIndex
ALTER INDEX "publication_metrics_account_observed_idx" RENAME TO "publication_metrics_social_account_id_observed_at_idx";

-- RenameIndex
ALTER INDEX "publication_metrics_publication_observed_idx" RENAME TO "publication_metrics_publication_record_id_observed_at_idx";

-- RenameIndex
ALTER INDEX "publication_metrics_publication_source_key" RENAME TO "publication_metrics_publication_record_id_source_key";

-- RenameIndex
ALTER INDEX "request_idempotency_company_operation_key_key" RENAME TO "request_idempotency_company_id_operation_key_key";

-- RenameIndex
ALTER INDEX "social_accounts_company_platform_idx" RENAME TO "social_accounts_company_id_platform_idx";

-- RenameIndex
ALTER INDEX "social_accounts_company_platform_key" RENAME TO "social_accounts_company_id_platform_key";

-- RenameIndex
ALTER INDEX "telegram_ideation_messages_thread_id_role_telegram_message_id_k" RENAME TO "telegram_ideation_messages_thread_id_role_telegram_message__key";

-- RenameIndex
ALTER INDEX "topic_candidates_created_idea_key" RENAME TO "topic_candidates_created_idea_id_key";

-- RenameIndex
ALTER INDEX "topic_candidates_run_position_idx" RENAME TO "topic_candidates_run_id_position_idx";

-- RenameIndex
ALTER INDEX "topic_candidates_run_position_key" RENAME TO "topic_candidates_run_id_position_key";

-- RenameIndex
ALTER INDEX "topic_discovery_runs_ai_request_key" RENAME TO "topic_discovery_runs_ai_request_log_id_key";

-- RenameIndex
ALTER INDEX "weekly_metrics_account_interval_key" RENAME TO "weekly_metrics_social_account_id_week_start_week_end_key";

-- RenameIndex
ALTER INDEX "weekly_metrics_account_week_start_idx" RENAME TO "weekly_metrics_social_account_id_week_start_idx";

-- RenameIndex
ALTER INDEX "weekly_metrics_evidence_asset_idx" RENAME TO "weekly_metrics_evidence_asset_id_idx";
