import { describe, expect, it } from 'vitest'
import { deriveAdaptationState } from '../src/modules/content/lifecycle.js'

describe('manual platform copy', () => {
  it('can progress with finished post copy and no separate CTA, hashtags, or visual recommendation', () => {
    expect(deriveAdaptationState({
      copy: 'A complete post with its CTA and hashtags already included. #example',
      cta: '',
      hashtags: '',
      visualRecommendation: '',
      adaptedFromMasterRevision: 1,
      masterRevision: 1,
      hasMaster: true,
    })).toBe('current')
  })
})
