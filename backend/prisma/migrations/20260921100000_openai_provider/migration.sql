-- Provider migration: keep existing Anthropic request/rate evidence valid,
-- while moving the current company settings to the canonical OpenAI model.

ALTER TABLE "ai_settings" DROP CONSTRAINT "ai_settings_provider_check";
ALTER TABLE "ai_request_logs" DROP CONSTRAINT "ai_request_logs_provider_check";
ALTER TABLE "ai_rate_versions" DROP CONSTRAINT "ai_rate_versions_provider_check";

UPDATE "ai_settings"
SET "provider" = 'openai',
    "model_id" = 'gpt-5.6-luna',
    "model_display_name" = 'GPT-5.6 Luna',
    "mode" = 'real',
    "version" = "version" + 1,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "provider" = 'anthropic';

ALTER TABLE "ai_settings"
  ADD CONSTRAINT "ai_settings_provider_check" CHECK ("provider" IN ('anthropic', 'openai'));
ALTER TABLE "ai_request_logs"
  ADD CONSTRAINT "ai_request_logs_provider_check" CHECK ("provider" IN ('anthropic', 'openai'));
ALTER TABLE "ai_rate_versions"
  ADD CONSTRAINT "ai_rate_versions_provider_check" CHECK ("provider" IN ('anthropic', 'openai'));
