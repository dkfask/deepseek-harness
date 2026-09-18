/** Read the immutable environment defaults selected for one packaged Desktop profile. */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Resource filename carrying profile-specific Desktop defaults. */
export const DESKTOP_RUNTIME_CONFIG_FILENAME = 'desktop-runtime-config.json'

/** Supported client artifact profiles. */
export type DesktopClientProfile = 'official' | 'thunderuni'

/** Parsed profile metadata written by the Desktop packaging command. */
export interface DesktopRuntimeConfig {
  readonly schemaVersion: 1
  readonly clientProfile: DesktopClientProfile
  readonly environment: Readonly<Record<string, string>>
}

/**
 * Read packaged profile defaults, tolerating older applications that predate the resource.
 * @param packaged - whether the Electron application is running from packaged resources.
 * @param resourcesPath - Electron's resource directory.
 * @returns immutable environment defaults for the active profile.
 */
export async function readDesktopRuntimeEnvironment(
  packaged: boolean,
  resourcesPath: string,
): Promise<Readonly<Record<string, string>>> {
  if (!packaged) return {}
  let source: string
  try {
    source = await readFile(join(resourcesPath, DESKTOP_RUNTIME_CONFIG_FILENAME), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException | null)?.code === 'ENOENT') return {}
    throw error
  }
  const config = parseDesktopRuntimeConfig(JSON.parse(source) as unknown)
  return config.environment
}

/**
 * Merge packaged defaults with launch overrides while keeping the launch environment authoritative.
 * @param packaged - defaults sealed into the application resources.
 * @param launch - environment inherited by Electron.
 * @returns child environment with launch values taking precedence.
 */
export function mergeDesktopRuntimeEnvironment(
  packaged: Readonly<Record<string, string>>,
  launch: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  return { ...packaged, ...launch }
}

function parseDesktopRuntimeConfig(value: unknown): DesktopRuntimeConfig {
  if (!isRecord(value) || value.schemaVersion !== 1
    || (value.clientProfile !== 'official' && value.clientProfile !== 'thunderuni')
    || !isRecord(value.environment)) {
    throw new Error('dsh desktop: invalid desktop-runtime-config.json')
  }
  const environment: Record<string, string> = {}
  for (const [name, entry] of Object.entries(value.environment)) {
    if (!/^[A-Z][A-Z0-9_]*$/u.test(name) || typeof entry !== 'string') {
      throw new Error('dsh desktop: invalid environment entry in desktop-runtime-config.json')
    }
    environment[name] = entry
  }
  return Object.freeze({
    schemaVersion: 1,
    clientProfile: value.clientProfile,
    environment: Object.freeze(environment),
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
