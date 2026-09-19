import type { AppConfig } from '../../../config/env.js'
import {
  CANONICAL_INSTAGRAM_USER_ID,
  INSTAGRAM_GRAPH_VERSION,
  InstagramProviderError,
  type InstagramAccountReach,
  type InstagramAccountReachOptions,
  type InstagramInsightsProvider,
  type InstagramMedia,
  type InstagramMediaInsights,
  type InstagramProfile,
} from './provider.js'

const GRAPH_HOST = 'https://graph.instagram.com'

export class MetaInstagramInsightsProvider implements InstagramInsightsProvider {
  private readonly accessToken: string | null
  private readonly userId: string | null

  constructor(config: Pick<AppConfig, 'instagramAccessToken' | 'instagramUserId'>) {
    this.accessToken = config.instagramAccessToken ?? null
    this.userId = config.instagramUserId ?? null
  }

  async getProfile(): Promise<InstagramProfile> {
    this.assertConfigured()
    const value = await this.request('/me', {
      fields: 'user_id,id,username,name,account_type,media_count,followers_count',
    })
    const userId = text(value.user_id) ?? text(value.id)
    const username = text(value.username)
    if (userId !== CANONICAL_INSTAGRAM_USER_ID || userId !== this.userId || !username) {
      throw new InstagramProviderError(502, null, null, null, 'Instagram account identity did not match the configured canonical account.')
    }
    const accountType = text(value.account_type)
    if (accountType && !['BUSINESS', 'CREATOR'].includes(accountType.toUpperCase())) {
      throw new InstagramProviderError(422, null, null, null, 'The configured Instagram account is not a professional account.')
    }
    return {
      userId,
      username,
      name: text(value.name),
      accountType,
      followersCount: count(value.followers_count),
      mediaCount: count(value.media_count),
    }
  }

  async listMedia(limit = 100): Promise<InstagramMedia[]> {
    this.assertConfigured()
    const value = await this.request(`/${this.userId}/media`, {
      fields: 'id,caption,media_type,media_product_type,timestamp,permalink,thumbnail_url',
      limit: String(Math.min(Math.max(limit, 1), 100)),
    })
    if (!Array.isArray(value.data)) return []
    return value.data.flatMap((item) => parseMedia(item))
  }

  async getMediaInsights(mediaId: string): Promise<InstagramMediaInsights> {
    this.assertConfigured()
    if (!/^\d+$/.test(mediaId)) throw new InstagramProviderError(422, null, null, null, 'The Instagram media ID is invalid.')
    const value = await this.request(`/${mediaId}/insights`, {
      metric: 'views,reach,likes,comments,saved,shares,total_interactions',
    })
    const values = new Map<string, number | null>()
    if (Array.isArray(value.data)) {
      for (const item of value.data) {
        const name = text(item?.name)
        if (name) values.set(name, metricValue(item?.values, item?.value))
      }
    }
    return {
      views: values.get('views') ?? null,
      reach: values.get('reach') ?? null,
      likes: values.get('likes') ?? null,
      comments: values.get('comments') ?? null,
      saves: values.get('saved') ?? values.get('saves') ?? null,
      shares: values.get('shares') ?? null,
      totalInteractions: values.get('total_interactions') ?? null,
    }
  }

  async getAccountReach(options: InstagramAccountReachOptions): Promise<InstagramAccountReach> {
    this.assertConfigured()
    const value = await this.request(`/${this.userId}/insights`, {
      metric: 'reach',
      period: options.period,
      ...(options.since ? { since: String(Math.floor(options.since.getTime() / 1000)) } : {}),
      ...(options.until ? { until: String(Math.floor(options.until.getTime() / 1000)) } : {}),
    })
    const item = Array.isArray(value.data) ? value.data.find((candidate) => text(candidate?.name) === 'reach') : undefined
    return {
      metric: 'reach',
      period: options.period,
      values: parseSeries(item?.values),
    }
  }

  private assertConfigured() {
    if (!this.accessToken || this.userId !== CANONICAL_INSTAGRAM_USER_ID) {
      throw new InstagramProviderError(503, null, null, null, 'Instagram API configuration is incomplete.')
    }
  }

  private async request(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    const url = new URL(`${GRAPH_HOST}/${INSTAGRAM_GRAPH_VERSION}${path}`)
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value))
    let response: Response
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Bearer ${this.accessToken}` },
      })
    } catch {
      throw new InstagramProviderError(503, null, null, null)
    }
    const body = await response.json().catch(() => undefined) as unknown
    if (!response.ok) {
      const error = body && typeof body === 'object' && !Array.isArray(body) && 'error' in body && body.error && typeof body.error === 'object'
        ? body.error as Record<string, unknown>
        : {}
      throw new InstagramProviderError(
        response.status,
        integer(error.code),
        text(error.type),
        integer(error.error_subcode),
      )
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InstagramProviderError(502, null, null, null)
    return body as Record<string, unknown>
  }
}

function parseMedia(value: unknown): InstagramMedia[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const item = value as Record<string, unknown>
  const id = text(item.id)
  const timestamp = text(item.timestamp)
  if (!id || !timestamp) return []
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return []
  return [{
    id,
    caption: text(item.caption),
    mediaType: text(item.media_type),
    mediaProductType: text(item.media_product_type),
    timestamp: date,
    permalink: text(item.permalink),
    thumbnailUrl: text(item.thumbnail_url),
  }]
}

function parseSeries(value: unknown): InstagramAccountReach['values'] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const row = item as Record<string, unknown>
    const value = count(row.value)
    if (value === null) return []
    const endTime = text(row.end_time)
    const date = endTime ? new Date(endTime) : null
    return [{ value, endTime: date && !Number.isNaN(date.getTime()) ? date : null }]
  })
}

function metricValue(values: unknown, directValue: unknown) {
  if (Array.isArray(values)) return count((values.at(-1) as Record<string, unknown> | undefined)?.value)
  return count(directValue)
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null
}

function count(value: unknown) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null
}

function integer(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null
}
