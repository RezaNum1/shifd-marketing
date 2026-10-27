# AI Visual Reference

## Purpose

AI Visual Reference supports visual ideation inside the existing Creative step. It produces reusable Canva directions for educational content, product showcases, and process/insight carousels, then helps the founder recreate and refine the final design manually in Canva.

AI-generated images are design references and are not treated as publication-ready creative assets.

## Scope and human-in-the-loop role

The feature does not publish, edit, or approve content. The founder remains responsible for selecting an inspiration reference, making the final visual decisions, recreating/refining the design in Canva, uploading the final PNG/JPG, and completing the existing Review workflow.

Selecting a reference does not create a final Asset, change Content lifecycle, satisfy the design-ready gate, create a schedule, or create a PublicationRecord.

## Two-stage flow

The user chooses `single_image` or `carousel`. Single-image generation performs one concept-planning request and one image request, returning one image direction chosen for the campaign. Carousel generation accepts 2–10 slides, plans one content-grounded story from the master and platform copy, and makes one image request per slide. Carousel references share one ordered outline, slide numbering, a common Canva design brief, and consistent visual system instructions; each image prompt focuses on its own slide. Invalid planner output stops the batch before image generation.

The image stage uses the configured OpenAI image provider and stores only validated private PNG files. A partial batch keeps successful references and records the batch as partial. A failed image is not fabricated and is not retried automatically.

## Inputs and configuration

The UI accepts platform, style, mood, format, and an optional short additional instruction. The backend combines these with concise company, product, campaign, variant, and existing visual-direction context. The planner follows the Shifd Labs palette (#1363DF, #3279E7, #E2EDFF, #FFFFFF, #151B2D), Inter typography, optional DM Serif Text accent, mobile readability, a clear single-message hierarchy, and whitespace. It avoids invented product UI, capabilities, testimonials, and metrics. Supported styles are `modern_minimal`, `corporate`, `editorial`, `bold_typography`, `product_ui_focused`, and `abstract_technology`. Supported moods are `professional`, `confident`, `approachable`, `innovative`, and `clean`.

Server-only configuration uses:

- `OPENAI_IMAGE_MODEL=gpt-image-2.5-sunburst`
- `OPENAI_IMAGE_QUALITY=medium`
- `OPENAI_IMAGE_FORMAT=png`

The existing `OPENAI_API_KEY` is reused. It is never exposed to frontend code or stored in PostgreSQL. Image requests use the official Image Generation API contract, with PNG output, explicit size, and no automatic SDK retries. See the [OpenAI Image Generation API reference](https://developers.openai.com/api/reference/cli/resources/images/methods/generate).

The portrait provider image is placed on a white 1080x1350 (4:5) Canva canvas, preserving the full reference within the target ratio. Square and landscape references keep their generated dimensions. The original provider request size remains recorded on the batch.

## Cost control

No image is generated on page load, route navigation, autosave, Content generation, adaptation, upload, review, approval, scheduling, or publication. The button disables while a batch is running and shows the selected slide count. Single-image mode is bounded to one text call plus one image call; carousel mode uses one text call plus 2–10 image calls. Regeneration is an explicit new batch and leaves previous batches available. There are no automatic paid retries.

## Private storage and retrieval

The transient provider base64 response is decoded in memory, validated as an actual PNG, and promoted into the existing private asset storage. Only storage metadata is persisted in `creative_references`; base64 data, OpenAI responses, and filesystem paths are not stored in normal API responses. Preview URLs require the authenticated application session and enforce company/content ownership.

## Canva workflow, selection, and regeneration

The founder can copy each PNG image to the clipboard for paste into Canva (on supported secure browsers), download each slide, and copy a Canva brief with design steps, brand values, search keywords, and the complete carousel outline. Selecting a single-image reference selects one option. Selecting any carousel slide selects the complete storyboard set for that Content and platform; selection is transactional and deselects the previous option or storyboard for that same Content/platform. It has no editorial, lifecycle, approval, final-asset, schedule, or publication side effect. Regeneration creates a new batch and does not overwrite the prior batch.

The Creative Asset Studio also stores one optional HTTPS Canva design link per Content workspace in `content_canva_design_links`. This link is an external production reference with company/content ownership, created/updated timestamps, and the recording users. It is shown in Content Detail after reload. It does not represent a final creative upload, completion, approval, scheduling, or publication; PNG/JPG upload and review readiness remain unchanged. Only `canva.com` and `www.canva.com` design paths are accepted, and Shifd does not fetch or inspect the private design.

## M4 and lifecycle exclusions

M4 combines its existing textual/contextual brand consistency assessment with a quick visual review of up to three final creative assets attached to the Variant. The backend reads the private files, resizes them, and sends image data directly to the configured vision-capable model; it never sends private asset URLs or storage keys. The visual result is a concise advisory pass/warning and does not replace the human visual-review checklist. Generating, selecting, and regenerating references do not change Content lifecycle or editorial revision. The final PNG/JPG upload and existing D-03/review readiness logic remain canonical.

## Failure handling

Provider authentication, rate-limit, timeout, provider, invalid-output, image-decoding, and private-storage failures are normalized to safe application errors. Planner failure produces zero image requests. Image failure produces a partial batch when other references succeed, and no automatic retry is attempted.

## Tests and smoke evidence

Deterministic unit coverage validates format-specific concept output and the official image-provider boundary with no paid calls. Existing backend and frontend unit suites remain separate from database-backed tests. Database-backed tests must use `TEST_DATABASE_URL` and never the development database.

The real paid smoke is intentionally bounded: one single-image provider/storage smoke precedes one full development batch of one planner call and one image call. Development references are not thesis evaluation evidence and are not copied into a research database.

Implementation verification attempted one single-image smoke with the configured development server environment. The provider boundary returned a normalized provider failure, so no second paid attempt was made. Development database migration and the authenticated full-batch smoke remain pending until the local PostgreSQL connection is available.

## Experimental Canva-Ready Design mode

`Canva-Ready Design` is an optional second mode. The existing `Original Design` prompt and image request options remain unchanged. The experimental mode reuses the same concept-planner request and the same number of image requests (one for a single image, one per carousel slide). It asks the configured image model for one transparent PNG illustration per slot, then builds a browser-side composition from native SVG background/decorative layers and editable typography specifications. Its illustration direction follows the same concept and visual metaphor as the planned Original Design, with a clean editorial illustration style, simplified forms, and restrained Shifd colors rather than photorealistic or glossy 3D artwork. The browser composition keeps text clear above a smaller lower-right illustration. It does not segment existing artwork, trace the raster image, call another image service, or make any additional generation request.

The default `gpt-image-2.5-sunburst` supports `background: "transparent"` with PNG output. The generated hero is stored as its original PNG without the Original Design mode's portrait canvas resize. The browser's Canva-ready ZIP contains `assets/hero-object.png`, genuine vector `assets/background.svg` and `assets/decorative-shapes.svg`, `typography.json`, `preview.png`, and `manifest.json`. The text specification uses the current content title/message/CTA, Inter, and the Shifd palette. Layout sliders adjust illustration and text positions and illustration scale.

This changes the content of the image request, so the resulting hero is not pixel-identical to the prior complete reference. Same request count does not guarantee identical billed output-token usage or total spend; check actual provider usage. The browser preview is a composition guide, and Canva-native text should be recreated from `typography.json`. Canva import and visual quality still need manual verification. The mode adds one defaulted `generation_mode` column to creative-reference batches; prior rows remain `original_design`.
