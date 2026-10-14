-- Keep provider token-cache usage and verified GPT-5.6 Luna rates so request
-- costs can be estimated from the exact rates active when the request starts.
ALTER TABLE "ai_request_logs"
  ADD COLUMN "cached_input_tokens" BIGINT,
  ADD CONSTRAINT "ai_request_logs_cached_input_tokens_check"
    CHECK ("cached_input_tokens" IS NULL OR "cached_input_tokens" >= 0),
  ADD CONSTRAINT "ai_request_logs_cached_tokens_within_input_check"
    CHECK ("cached_input_tokens" IS NULL OR "input_tokens" IS NULL OR "cached_input_tokens" <= "input_tokens");

ALTER TABLE "ai_rate_versions"
  ADD COLUMN "cached_input_usd_per_million" DECIMAL(18,8),
  ADD CONSTRAINT "ai_rate_versions_cached_input_rate_check"
    CHECK ("cached_input_usd_per_million" IS NULL OR "cached_input_usd_per_million" >= 0);

INSERT INTO "ai_rate_versions" (
  "id", "provider", "model", "version", "input_usd_per_million",
  "cached_input_usd_per_million", "output_usd_per_million", "effective_from",
  "source_reference"
) VALUES (
  '314d3bf7-53e8-4c58-89fa-9766428b4420',
  'openai',
  'gpt-5.6-luna',
  '2026-07-30',
  0.20,
  0.02,
  1.20,
  '2026-07-30T00:00:00.000Z',
  'https://developers.openai.com/api/docs/models/gpt-5.6-luna'
);

-- Historical logs did not retain cached-token counts. Backfill an explicitly
-- uncached-input estimate for successful real requests with complete token
-- counts; keep requests with incomplete usage unknown.
UPDATE "ai_request_logs" AS request
SET "estimated_cost_usd" = (
      ((request."input_tokens" - COALESCE(request."cached_input_tokens", 0)) * rate."input_usd_per_million"
        + COALESCE(request."cached_input_tokens", 0) * rate."cached_input_usd_per_million") / 1000000
        * CASE WHEN request."input_tokens" > 272000 THEN 2 ELSE 1 END
      + request."output_tokens" * rate."output_usd_per_million" / 1000000
        * CASE WHEN request."input_tokens" > 272000 THEN 1.5 ELSE 1 END
    ),
    "cost_basis" = jsonb_build_object(
      'id', rate."id",
      'version', rate."version",
      'inputUsdPerMillion', rate."input_usd_per_million"::text,
      'cachedInputUsdPerMillion', rate."cached_input_usd_per_million"::text,
      'outputUsdPerMillion', rate."output_usd_per_million"::text,
      'historicalCachedInputAssumption', 'uncached'
    )
FROM "ai_rate_versions" AS rate
WHERE request."provider" = rate."provider"
  AND request."model" = rate."model"
  AND rate."version" = '2026-07-30'
  AND request."provider" = 'openai'
  AND request."model" = 'gpt-5.6-luna'
  AND request."mode" = 'real'
  AND request."status" = 'success'
  AND request."created_at" >= rate."effective_from"
  AND request."estimated_cost_usd" IS NULL
  AND request."input_tokens" IS NOT NULL
  AND request."output_tokens" IS NOT NULL;
