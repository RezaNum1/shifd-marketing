export const INSTAGRAM_GRAPH_VERSION = 'v24.0'
export const CANONICAL_INSTAGRAM_USER_ID = '17841447520550815'

export interface InstagramProfile {
  userId: string
  username: string
  name: string | null
  accountType: string | null
  followersCount: number | null
  mediaCount: number | null
}

export interface InstagramMedia {
  id: string
  caption: string | null
  mediaType: string | null
  mediaProductType: string | null
  timestamp: Date
  permalink: string | null
  thumbnailUrl: string | null
}

export interface InstagramMediaInsights {
  views: number | null
  reach: number | null
  likes: number | null
  comments: number | null
  saves: number | null
  shares: number | null
  totalInteractions: number | null
}

export interface InstagramAccountReach {
  metric: 'reach'
  period: 'day' | 'week' | 'days_28' | 'lifetime'
  values: Array<{ value: number; endTime: Date | null }>
}

export interface InstagramAccountReachOptions {
  period: InstagramAccountReach['period']
  since?: Date
  until?: Date
}

export interface InstagramInsightsProvider {
  getProfile(): Promise<InstagramProfile>
  listMedia(limit?: number): Promise<InstagramMedia[]>
  getMediaInsights(mediaId: string): Promise<InstagramMediaInsights>
  getAccountReach(options: InstagramAccountReachOptions): Promise<InstagramAccountReach>
}

export class InstagramProviderError extends Error {
  constructor(
    public readonly status: number,
    public readonly providerCode: number | null,
    public readonly providerType: string | null,
    public readonly providerSubcode: number | null,
    message = 'Instagram API request failed.',
  ) {
    super(message)
    this.name = 'InstagramProviderError'
  }
}
