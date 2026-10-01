# AI Visual Reference

## Purpose

AI Visual Reference supports visual ideation inside the existing Creative step. It helps the founder explore possible compositions before recreating and refining the final design manually in Canva.

AI-generated images are design references and are not treated as publication-ready creative assets.

## Scope and human-in-the-loop role

The feature does not publish, edit, or approve content. The founder remains responsible for selecting an inspiration reference, making the final visual decisions, recreating/refining the design in Canva, uploading the final PNG/JPG, and completing the existing Review workflow.

Selecting a reference does not create a final Asset, change Content lifecycle, satisfy the design-ready gate, create a schedule, or create a PublicationRecord.

## Two-stage flow

An explicit `Generate 3 References` action performs one concept-planning request through the existing GPT-5.6 Luna provider and then one image request per valid concept. The planner must return exactly three distinct structured concepts containing a name, rationale, layout notes, visual focus, typography direction, and image prompt. Invalid planner output stops the batch before image generation.

The image stage uses the configured OpenAI image provider and stores only validated private PNG files. A partial batch keeps successful references and records the batch as partial. A failed image is not fabricated and is not retried automatically.

## Inputs and configuration

The UI accepts platform, style, mood, format, and an optional short additional instruction. The backend combines these with concise company, product, campaign, variant, and existing visual-direction context. Supported styles are `modern_minimal`, `corporate`, `editorial`, `bold_typography`, `product_ui_focused`, and `abstract_technology`. Supported moods are `professional`, `confident`, `approachable`, `innovative`, and `clean`.

Server-only configuration uses:

- `OPENAI_IMAGE_MODEL=gpt-image-2`
- `OPENAI_IMAGE_QUALITY=medium`
- `OPENAI_IMAGE_FORMAT=png`

The existing `OPENAI_API_KEY` is reused. It is never exposed to frontend code or stored in PostgreSQL. Image requests use the official Image Generation API contract, with PNG output, explicit size, and no automatic SDK retries. See the [OpenAI Image Generation API reference](https://developers.openai.com/api/reference/cli/resources/images/methods/generate).

The aspect-ratio choices map to reference sizes as follows: `portrait_4_5` to `1024x1536`, `square_1_1` to `1024x1024`, and `landscape` to `1536x1024`. The requested aspect choice and generated size are both stored; the generated dimensions are not described as an exact social-network pixel ratio.

## Cost control

No image is generated on page load, route navigation, autosave, Content generation, adaptation, upload, review, approval, scheduling, or publication. The button disables while a batch is running. Regeneration is an explicit new batch and leaves previous batches available. The normal request is bounded to one text call plus three image calls, with no transparent paid retry.

## Private storage and retrieval

The transient provider base64 response is decoded in memory, validated as an actual PNG, and promoted into the existing private asset storage. Only storage metadata is persisted in `creative_references`; base64 data, OpenAI responses, and filesystem paths are not stored in normal API responses. Preview URLs require the authenticated application session and enforce company/content ownership.

## Selection and regeneration

At most one reference is selected for a Content and platform. Selection is transactional and deselects another reference for that same Content/platform. It has no editorial, lifecycle, approval, final-asset, schedule, or publication side effect. Regeneration creates a new batch and does not overwrite the prior batch.

## M4 and lifecycle exclusions

M4 remains the existing textual/contextual brand consistency assessment. AI reference images are not passed to M4 and no image-vision assessment is claimed. Generating, selecting, and regenerating references do not change Content lifecycle or editorial revision. The final PNG/JPG upload and existing D-03/review readiness logic remain canonical.

## Failure handling

Provider authentication, rate-limit, timeout, provider, invalid-output, image-decoding, and private-storage failures are normalized to safe application errors. Planner failure produces zero image requests. Image failure produces a partial batch when other references succeed, and no automatic retry is attempted.

## Tests and smoke evidence

Deterministic unit coverage validates exactly-three concept output and the official image-provider boundary with no paid calls. Existing backend and frontend unit suites remain separate from database-backed tests. Database-backed tests must use `TEST_DATABASE_URL` and never the development database.

The real paid smoke is intentionally bounded: one single-image provider/storage smoke precedes one full development batch of one planner call and three image calls. Development references are not thesis evaluation evidence and are not copied into a research database.

Implementation verification attempted one single-image smoke with the configured development server environment. The provider boundary returned a normalized provider failure, so no second paid attempt was made. Development database migration and the authenticated full-batch smoke remain pending until the local PostgreSQL connection is available.
