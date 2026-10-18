-- Development-only deterministic responses are recorded separately from
-- billable OpenAI/legacy Anthropic requests.
ALTER TABLE "ai_request_logs"
  DROP CONSTRAINT "ai_request_logs_provider_check";

ALTER TABLE "ai_request_logs"
  ADD CONSTRAINT "ai_request_logs_provider_check"
  CHECK ("provider" IN ('anthropic', 'openai', 'mock'));
