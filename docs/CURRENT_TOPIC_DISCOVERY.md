# Current Topic Discovery

## Purpose

Current Topic Discovery is a small, explicit ideation enhancement inside the
Ideas workflow. It uses one server-side OpenAI Responses API request with the
built-in `web_search` tool to surface up to six timely, business-relevant topic
opportunities. A founder reviews the evidence and explicitly chooses whether
to use one candidate as a normal Shifd Marketing Idea.

The feature is called Current Topic Discovery rather than Trending Topics
because it does not measure popularity, virality, rank, or statistical trend
strength. The feature surfaces source-backed current topic opportunities. It
does not produce a quantitative measure of topic popularity or virality.

## Search and context

The operation is `M2 / idea.discovery.web_search`, with prompt identity
`m2.idea_discovery_web_search.v1`, using the configured text model
`OPENAI_MODEL` (the canonical model is `gpt-5.6-luna`). Search is server-side
only, uses `store: false`, `maxRetries: 0`, medium search context, and a safe
country-level location of `ID` when supported by the SDK. No new API secret is
required.

The request combines the selected market, timeframe, optional focus, and a
concise snapshot of canonical M1 Company Context. When a Product is selected,
its concise product/profile context is included. The backend validates Product
ownership before creating a request. Company-only discovery is supported by
leaving `productId` null.

Current Topic Discovery uses the discovery-specific
`TOPIC_DISCOVERY_MAX_OUTPUT_TOKENS` budget, defaulting to 4,096. It is larger
than the ordinary AI output budget because one Responses API result may
contain up to six source-backed candidates plus source metadata. This budget
does not guarantee six candidates; fewer candidates, including zero, remain
valid when the current evidence is insufficient.

`last_7_days` asks the model to prioritize sources published or updated during
the previous seven days as of the recorded search time. `last_30_days` uses the
previous thirty days. Evergreen sources may add background, but a candidate's
current signal must be grounded in recent evidence. If evidence is
insufficient, fewer than six candidates, including zero, are returned.

## Source validation and persistence

The provider's web-search source metadata is collected from the Responses API,
including `web_search_call.action.sources` and URL citation annotations when
available. Model-written URLs are only accepted when their normalized URL is
present in that actual provider source set. Candidates with no validated source
are removed before persistence or display. No web pages are copied; persisted
source evidence is limited to URL, title, publisher, published date, and the
observed timestamp.

Each discovery creates an immutable snapshot in `topic_discovery_runs` and
`topic_candidates`. `searchedAt` and each source's `observedAt` distinguish a
topic surfaced on a particular date from a permanent claim that it is
trending. Failed later searches do not delete earlier runs.

## Human selection and Idea conversion

Candidates are not Ideas. No Idea is created when discovery runs. The founder
must click **Use as Idea**. That action runs in a transaction, locks the
candidate, prevents duplicate conversion, records `selectedAt` and
`createdIdeaId`, and uses the existing canonical ContentIdea creation and
validation service. The resulting Idea has the existing Ready status and
continues through the unchanged Idea → Brief → Generate → Adapt → Creative →
Review → Schedule flow.

## Cost control and failure behavior

Search only runs after an explicit Discover action. Page load, navigation,
refresh, autosave, product selection, and other workflows never search. The
frontend disables the action while pending; the backend requires the existing
request-idempotency key and stores a pending request before calling the
provider. Duplicate calls cannot create simultaneous paid searches, and no
automatic retry is performed.

Provider authentication errors, unavailable search, rate limits, 4xx/5xx,
timeouts, malformed structured output, and missing current evidence result in
safe normalized errors or an empty state. Existing successful runs remain
available. The feature does not crawl or scrape social platforms, use Google
Trends, monitor in the background, predict virality, generate campaigns, or
publish content. Incomplete Responses API results, including
`incomplete_details.reason = max_output_tokens`, are rejected and never
parsed or persisted as candidates.

## Traceability

The operation is logged in `ai_request_logs` with provider, model, M2 module,
operation, prompt FK, provider request ID when available, token usage when
returned, status, and timing. No API key or fetched webpage body is logged.

## Tests

Automated provider and route tests should mock the discovery provider boundary;
they must not call OpenAI or live web search. Database coverage belongs only on
`shifd_marketing_test`, never `shifd_marketing_dev`, and covers ownership,
run/candidate/source persistence, conversion idempotency, old-run preservation,
failure isolation, and M2 prompt/log identity. Frontend coverage covers the
manual Create Idea action, no-auto-search behavior, form defaults, loading and
duplicate-click protection, candidate cards, validated source links, empty
state, and Use as Idea.

## Manual UAT

1. Start local PostgreSQL, backend, and frontend.
2. Log in and open Ideas.
3. Click **Discover Current Topics**.
4. Select **Shifd Approval**, keep Market as **Indonesia**, and select **Last 7
   Days**.
5. Optionally enter: `document approval, business administration, workflow
   efficiency`.
6. Click **Discover Topics** once.
7. Verify up to six current source-backed candidates.
8. Open at least two source links and confirm they correspond to the topic.
9. Click **Use as Idea** on one candidate and verify exactly one normal Ready
   Idea is created.
10. Continue through the existing content workflow if desired.

Real provider smoke is environment-dependent. If the execution environment
cannot reach `api.openai.com`, the smoke is not run there; mocked tests and
builds remain the implementation verification, and the UAT above is the
manual commissioning path from a normal local environment.

## Thesis methodology follow-up

Thesis methodology follow-up is required. Frame this capability as
web-search-assisted topic discovery or source-backed current topic discovery.
Human judgment remains responsible for relevance, selection, Idea conversion,
and all downstream content approval. It reduces ideation/search effort; it
does not automate marketing strategy or constitute real-time market
intelligence.
