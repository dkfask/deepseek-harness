import { describe, expect, it } from 'vitest'
import { parseReleasePackInvocation } from './pack.ts'

describe('release pack invocation', () => {
  it('defaults the client profile to official', () => {
    expect(parseReleasePackInvocation(['--family', 'dsh'])).toEqual({
      family: 'dsh',
      profile: 'official',
    })
  })

  it('parses the selected client profile and optional output controls', () => {
    expect(parseReleasePackInvocation([
      '--family', 'dsh',
      '--profile', 'thunderuni',
      '--out', 'dist/thunderuni',
      '--concurrency', '2',
    ])).toEqual({
      family: 'dsh',
      profile: 'thunderuni',
      out: 'dist/thunderuni',
      concurrency: '2',
    })
  })

  it('rejects unknown profiles and missing release families', () => {
    expect(() => parseReleasePackInvocation(['--family', 'dsh', '--profile', 'unknown']))
      .toThrow(/official.*thunderuni/u)
    expect(() => parseReleasePackInvocation([]))
      .toThrow(/--family <dsh\|vendor>/u)
  })
})
