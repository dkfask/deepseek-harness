import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-experimental-sub2api',
  ['lib/types/index.js'],
  { hostPhase: true },
)
