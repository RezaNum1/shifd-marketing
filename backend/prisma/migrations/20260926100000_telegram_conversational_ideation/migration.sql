ALTER TABLE "content_ideas"
  ADD COLUMN "source_type" TEXT,
  ADD COLUMN "source_reference" TEXT,
  ADD COLUMN "source_summary" TEXT;

ALTER TABLE "prompt_versions"
  DROP CONSTRAINT "prompt_versions_operation_check";

ALTER TABLE "prompt_versions"
  ADD CONSTRAINT "prompt_versions_operation_check" CHECK (
    ("module" = 'M2' AND "operation" IN ('generate', 'creative_reference.concepts', 'idea.discovery.web_search', 'telegram.ideation.chat', 'telegram.ideation.structure')) OR
    ("module" = 'M3' AND "operation" = 'adapt') OR
    ("module" = 'M4' AND "operation" = 'brand_check')
  );

ALTER TABLE "ai_request_logs"
  DROP CONSTRAINT "ai_request_logs_module_operation_check";

ALTER TABLE "ai_request_logs"
  ADD CONSTRAINT "ai_request_logs_module_operation_check" CHECK (
    ("module" = 'M2' AND "operation" IN ('generate', 'creative_reference.concepts', 'creative_reference.image', 'idea.discovery.web_search', 'telegram.ideation.chat', 'telegram.ideation.structure')) OR
    ("module" = 'M3' AND "operation" = 'adapt') OR
    ("module" = 'M4' AND "operation" = 'brand_check')
  );

CREATE TABLE "telegram_integrations" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "telegram_user_id" TEXT NOT NULL,
  "telegram_chat_id" TEXT NOT NULL,
  "telegram_username_snapshot" TEXT,
  "active_product_id" UUID,
  "status" TEXT NOT NULL DEFAULT 'active',
  "linked_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unlinked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "telegram_integrations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "telegram_link_tokens" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "consumed_at" TIMESTAMPTZ(3),
  "revoked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_link_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "telegram_ideation_threads" (
  "id" UUID NOT NULL,
  "integration_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "product_id" UUID,
  "status" TEXT NOT NULL DEFAULT 'active',
  "revision" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "closed_at" TIMESTAMPTZ(3),
  CONSTRAINT "telegram_ideation_threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "telegram_ideation_messages" (
  "id" UUID NOT NULL,
  "thread_id" UUID NOT NULL,
  "role" TEXT NOT NULL,
  "telegram_message_id" TEXT,
  "text" TEXT NOT NULL,
  "ai_request_log_id" UUID,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_ideation_messages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "telegram_idea_drafts" (
  "id" UUID NOT NULL,
  "thread_id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "product_id" UUID,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "target_audience" TEXT NOT NULL,
  "content_angle" TEXT NOT NULL,
  "content_pillar_code" TEXT,
  "objective" TEXT NOT NULL DEFAULT 'education',
  "conversation_summary" TEXT NOT NULL,
  "conversation_revision" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending_confirmation',
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmed_at" TIMESTAMPTZ(3),
  "cancelled_at" TIMESTAMPTZ(3),
  "idea_id" UUID,
  CONSTRAINT "telegram_idea_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "telegram_webhook_updates" (
  "id" UUID NOT NULL,
  "update_id" BIGINT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'received',
  "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMPTZ(3),
  "company_id" UUID,
  CONSTRAINT "telegram_webhook_updates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "telegram_callback_tokens" (
  "id" UUID NOT NULL,
  "integration_id" UUID NOT NULL,
  "draft_id" UUID,
  "product_id" UUID,
  "token_hash" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "expires_at" TIMESTAMPTZ(3) NOT NULL,
  "used_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_callback_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_integrations_telegram_user_id_key" ON "telegram_integrations"("telegram_user_id");
CREATE UNIQUE INDEX "telegram_integrations_telegram_chat_id_key" ON "telegram_integrations"("telegram_chat_id");
CREATE UNIQUE INDEX "telegram_link_tokens_token_hash_key" ON "telegram_link_tokens"("token_hash");
CREATE UNIQUE INDEX "telegram_ideation_messages_thread_id_role_telegram_message_id_key" ON "telegram_ideation_messages"("thread_id", "role", "telegram_message_id");
CREATE UNIQUE INDEX "telegram_idea_drafts_idea_id_key" ON "telegram_idea_drafts"("idea_id");
CREATE UNIQUE INDEX "telegram_webhook_updates_update_id_key" ON "telegram_webhook_updates"("update_id");
CREATE UNIQUE INDEX "telegram_callback_tokens_token_hash_key" ON "telegram_callback_tokens"("token_hash");

CREATE INDEX "telegram_integrations_company_id_status_idx" ON "telegram_integrations"("company_id", "status");
CREATE INDEX "telegram_integrations_user_id_status_idx" ON "telegram_integrations"("user_id", "status");
CREATE INDEX "telegram_link_tokens_company_id_user_id_expires_at_idx" ON "telegram_link_tokens"("company_id", "user_id", "expires_at");
CREATE INDEX "telegram_ideation_threads_integration_id_status_updated_at_idx" ON "telegram_ideation_threads"("integration_id", "status", "updated_at");
CREATE INDEX "telegram_ideation_threads_company_id_user_id_status_idx" ON "telegram_ideation_threads"("company_id", "user_id", "status");
CREATE INDEX "telegram_ideation_messages_thread_id_created_at_id_idx" ON "telegram_ideation_messages"("thread_id", "created_at", "id");
CREATE INDEX "telegram_idea_drafts_thread_id_status_idx" ON "telegram_idea_drafts"("thread_id", "status");
CREATE INDEX "telegram_idea_drafts_company_id_user_id_status_idx" ON "telegram_idea_drafts"("company_id", "user_id", "status");
CREATE INDEX "telegram_webhook_updates_status_received_at_idx" ON "telegram_webhook_updates"("status", "received_at");
CREATE INDEX "telegram_callback_tokens_integration_id_action_expires_at_idx" ON "telegram_callback_tokens"("integration_id", "action", "expires_at");

ALTER TABLE "telegram_integrations" ADD CONSTRAINT "telegram_integrations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_integrations" ADD CONSTRAINT "telegram_integrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_integrations" ADD CONSTRAINT "telegram_integrations_active_product_id_fkey" FOREIGN KEY ("active_product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_link_tokens" ADD CONSTRAINT "telegram_link_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_ideation_threads" ADD CONSTRAINT "telegram_ideation_threads_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "telegram_integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_ideation_threads" ADD CONSTRAINT "telegram_ideation_threads_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_ideation_threads" ADD CONSTRAINT "telegram_ideation_threads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_ideation_threads" ADD CONSTRAINT "telegram_ideation_threads_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_ideation_messages" ADD CONSTRAINT "telegram_ideation_messages_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "telegram_ideation_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_ideation_messages" ADD CONSTRAINT "telegram_ideation_messages_ai_request_log_id_fkey" FOREIGN KEY ("ai_request_log_id") REFERENCES "ai_request_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_idea_drafts" ADD CONSTRAINT "telegram_idea_drafts_thread_id_fkey" FOREIGN KEY ("thread_id") REFERENCES "telegram_ideation_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_idea_drafts" ADD CONSTRAINT "telegram_idea_drafts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_idea_drafts" ADD CONSTRAINT "telegram_idea_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_idea_drafts" ADD CONSTRAINT "telegram_idea_drafts_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_idea_drafts" ADD CONSTRAINT "telegram_idea_drafts_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "content_ideas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_idea_drafts" ADD CONSTRAINT "telegram_idea_drafts_content_pillar_code_fkey" FOREIGN KEY ("content_pillar_code") REFERENCES "content_pillars"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_webhook_updates" ADD CONSTRAINT "telegram_webhook_updates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_callback_tokens" ADD CONSTRAINT "telegram_callback_tokens_integration_id_fkey" FOREIGN KEY ("integration_id") REFERENCES "telegram_integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_callback_tokens" ADD CONSTRAINT "telegram_callback_tokens_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "telegram_idea_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_callback_tokens" ADD CONSTRAINT "telegram_callback_tokens_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "content_ideas" ADD CONSTRAINT "content_ideas_source_type_check" CHECK ("source_type" IS NULL OR "source_type" IN ('telegram_ideation'));
ALTER TABLE "telegram_integrations" ADD CONSTRAINT "telegram_integrations_status_check" CHECK ("status" IN ('active', 'inactive'));
ALTER TABLE "telegram_ideation_threads" ADD CONSTRAINT "telegram_ideation_threads_status_check" CHECK ("status" IN ('active', 'saved', 'abandoned'));
ALTER TABLE "telegram_ideation_messages" ADD CONSTRAINT "telegram_ideation_messages_role_check" CHECK ("role" IN ('user', 'assistant'));
ALTER TABLE "telegram_idea_drafts" ADD CONSTRAINT "telegram_idea_drafts_status_check" CHECK ("status" IN ('pending_confirmation', 'saved', 'cancelled', 'expired'));
ALTER TABLE "telegram_callback_tokens" ADD CONSTRAINT "telegram_callback_tokens_action_check" CHECK ("action" IN ('save_draft', 'cancel_draft', 'select_product'));
