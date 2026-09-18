import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DESKTOP_RUNTIME_CONFIG_FILENAME,
  mergeDesktopRuntimeEnvironment,
  readDesktopRuntimeEnvironment,
} from '../src/runtime-config.ts'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function fixture(contents: unknown): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-desktop-runtime-config-'))
  temporaryDirectories.push(directory)
  await writeFile(join(directory, DESKTOP_RUNTIME_CONFIG_FILENAME), `${JSON.stringify(contents)}\n`)
  return directory
}

describe('desktop runtime config', () => {
  it('loads profile defaults and lets the launch environment override them', async () => {
    const resources = await fixture({
      schemaVersion: 1,
      clientProfile: 'thunderuni',
      environment: { DSH_SUB2API_ENABLED: 'true', DSH_SUB2API_GATEWAY_URL: 'http://127.0.0.1:8090' },
    })
    const packaged = await readDesktopRuntimeEnvironment(true, resources)
    expect(packaged).toEqual({
      DSH_SUB2API_ENABLED: 'true',
      DSH_SUB2API_GATEWAY_URL: 'http://127.0.0.1:8090',
    })
    expect(mergeDesktopRuntimeEnvironment(packaged, {
      DSH_SUB2API_GATEWAY_URL: 'https://override.example.test',
      DSH_SUB2API_LLM_ENABLED: 'true',
    })).toEqual({
      DSH_SUB2API_ENABLED: 'true',
      DSH_SUB2API_GATEWAY_URL: 'https://override.example.test',
      DSH_SUB2API_LLM_ENABLED: 'true',
    })
  })

  it('treats an absent config as an older official package', async () => {
    expect(await readDesktopRuntimeEnvironment(true, join(tmpdir(), 'dsh-missing-runtime-config'))).toEqual({})
    expect(await readDesktopRuntimeEnvironment(false, 'not-used')).toEqual({})
  })

  it('rejects malformed packaged defaults', async () => {
    const resources = await fixture({ schemaVersion: 1, clientProfile: 'thunderuni', environment: { 'bad-name': 'true' } })
    await expect(readDesktopRuntimeEnvironment(true, resources)).rejects.toThrow(/invalid environment entry/u)
  })
})
