# AI Provider Modes

Development defaults to `AI_PROVIDER_MODE=mock`. The deterministic development
provider returns schema-shaped fixtures for text, discovery, prospect research,
Telegram, and creative-reference workflows. It does not contact OpenAI, perform
live web search, or evaluate images. Generated mock images are local fixtures.
Mock request logs are marked `provider=mock`, `model=deterministic-fixtures`,
and `mode=demo`; they have no token counts or estimated cost.

Set `AI_PROVIDER_MODE=openai` in a local environment only when a deliberate live
API check is needed. That mode requires a valid `OPENAI_API_KEY` and uses the
configured OpenAI models. Production is restricted to `AI_PROVIDER_MODE=openai`.
Use a development-only API project and key for live local checks, never the
production secret.

The active provider and model appear on **AI & System**. The development mock
notice also explains that generated output is illustrative and that live search,
image generation, and model evaluation are inactive.
