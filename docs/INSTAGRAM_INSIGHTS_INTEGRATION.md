# Instagram Insights Integration

Status: read-only Instagram Insights integration for the Phase 11 Performance
Tracker.

## Account and provider boundary

The production adapter uses the Instagram API with Instagram Login at
`graph.instagram.com/v24.0`. The configured account is the verified
professional account `@shifdlabs` with canonical Instagram user ID
`17841447520550815`.

Credentials remain server-only environment values. They are not returned by
integration APIs, stored in PostgreSQL, or written to logs. The integration has
no publishing, editing, commenting, inbox, token-refresh, worker, or cron
behavior.

## Verified account capabilities

- `followers_count` is stored only as a current follower snapshot when an
  explicit sync runs.
- Account `reach` can return daily observations.
- `views`, `accounts_engaged`, `total_interactions`, `likes`, `comments`,
  `saves`, `shares`, `follows_and_unfollows`, and `profile_links_taps` are
  accepted by the account endpoint but currently return empty datasets for the
  verified account.
- `impressions` is unsupported by the account Insights endpoint.

Empty datasets are preserved as `null`; an explicit provider value of `0` is
preserved as `0`.

The account sync does not sum daily reach into weekly reach. A weekly account
reach value is stored only if the provider returns one genuine compatible
weekly observation. It also does not substitute media views for impressions.

## Verified media capabilities

For an existing manually recorded Instagram `PublicationRecord`, the adapter
matches by normalized post permalink or a previously stored external media ID.
Ambiguous records are reported as needing operator selection and are not
guessed from captions or titles.

Media Insights persist the exact values returned for:

- `views`
- `reach`
- `likes`
- `comments`
- `saved`, normalized to `saves`
- `shares`
- `total_interactions`

These observations are stored in the provider-neutral `publication_metrics`
table with `source=instagram_api`. Repeated sync updates the current canonical
observation and increments its version without changing the publication
record, Content lifecycle, schedule, or publication evidence.

## Reporting semantics

Publication reporting exposes `postMetrics` with `scope=publication` and
`source=instagram_api`. The Performance recent-publication view labels these
values as Post Views, Post Reach, Post Likes, Post Comments, Post Saves, Post
Shares, and Total Interactions. A dash means the provider returned no value.

Account-week metrics remain separate from publication metrics. Instagram
account impressions and impressions-based engagement rate remain unavailable
when Meta does not return impressions. Media reach is not summed into account
reach, and daily account reach is not summed into weekly reach.

## Test boundary

Automated database-backed tests require `TEST_DATABASE_URL` and reject a value
equal to `DATABASE_URL`. Production Meta calls are not used by tests; tests
inject a deterministic `InstagramInsightsProvider`.
