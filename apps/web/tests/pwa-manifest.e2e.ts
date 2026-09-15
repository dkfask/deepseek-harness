import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'

const DIST_ROOT = fileURLToPath(new URL('../dist', import.meta.url))
const BUILD_RECORD_PATH = fileURLToPath(new URL('../../../.dsh-build/client-build-environment.json', import.meta.url))

interface ClientBuildRecord {
  readonly environment?: {
    readonly DSH_CLIENT_TITLE?: string
  }
}

async function clientBuildTitle(): Promise<string> {
  const record = JSON.parse(await readFile(BUILD_RECORD_PATH, 'utf8')) as ClientBuildRecord
  const title = record.environment?.DSH_CLIENT_TITLE
  if (title === undefined) throw new Error('client build record must carry DSH_CLIENT_TITLE')
  return title
}

it('ships install metadata with the built web application', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<link rel="manifest" href="./manifest.webmanifest" />')

  const manifest: unknown = JSON.parse(await readFile(join(DIST_ROOT, 'manifest.webmanifest'), 'utf8'))
  const title = await clientBuildTitle()
  expect(manifest).toEqual({
    id: '/',
    name: title,
    short_name: title,
    start_url: '/',
    scope: '/',
    display: 'fullscreen',
    icons: [{
      src: '/favicon.svg',
      sizes: 'any',
      type: 'image/svg+xml',
      purpose: 'any',
    }],
  })
})

it('ships a favicon that switches to a light mark under dark color scheme', async () => {
  const favicon = await readFile(join(DIST_ROOT, 'favicon.svg'), 'utf8')
  // The light fill must live inside the dark-scheme media query, so the icon
  // stays black in light mode and only turns white under a dark scheme.
  expect(favicon).toMatch(/@media \(prefers-color-scheme: dark\)\s*{\s*path\s*{[^}]*fill:\s*#fff/i)
  expect(favicon).toContain('fill="#000"')
})
