import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { load } from 'js-yaml'

const root = resolve(import.meta.dirname, '..')

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function workflow(): RecordValue {
  const parsed: unknown = load(readFileSync(resolve(root, '.github/workflows/release-desktop-publish.yml'), 'utf8'))
  if (!isRecord(parsed)) throw new TypeError('Desktop release workflow must define a mapping')
  return parsed
}

function job(document: RecordValue, name: string): RecordValue {
  if (!isRecord(document.jobs) || !isRecord(document.jobs[name])) {
    throw new TypeError(`Desktop release workflow must define ${name}`)
  }
  return document.jobs[name]
}

function stepsOf(value: RecordValue): RecordValue[] {
  if (!Array.isArray(value.steps)) throw new TypeError('Desktop release job must define steps')
  return value.steps.filter(isRecord)
}

describe('Windows Desktop release workflow', () => {
  it('is manual, tag-driven, and exposes only the intended release inputs', () => {
    const document = workflow()
    expect(isRecord(document.on)).toBe(true)
    if (!isRecord(document.on)) throw new TypeError('Desktop release workflow must define an on mapping')
    const workflowDispatch = document.on.workflow_dispatch
    expect(isRecord(workflowDispatch)).toBe(true)
    if (!isRecord(workflowDispatch)) throw new TypeError('Desktop release workflow must define workflow_dispatch')
    const inputs = workflowDispatch
    expect(inputs.inputs).toMatchObject({
      ref: { required: true, type: 'string' },
      profile: { required: true, default: 'thunderuni', type: 'choice', options: ['thunderuni', 'official'] },
      environment: { required: true, default: 'test', type: 'choice', options: ['test', 'production'] },
      publish: { required: true, default: false, type: 'boolean' },
    })
    expect(document.permissions).toEqual({ contents: 'read' })
    expect(document.concurrency).toMatchObject({ 'cancel-in-progress': false })
  })

  it('signs once on the protected Windows runner and uploads provenance with the artifact', () => {
    const document = workflow()
    const pack = job(document, 'pack')
    expect(pack['runs-on']).toEqual(['self-hosted', 'dsh-win-release', 'windows', 'x64'])
    expect(pack.environment).toBe('desktop-signing')
    expect(pack.outputs).toEqual({ artifact_name: '${{ steps.bundle.outputs.artifact_name }}' })
    const steps = stepsOf(pack)
    const checkout = steps.find(step => step.uses === 'actions/checkout@v6')
    expect(checkout).toMatchObject({ with: { ref: '${{ inputs.ref }}', 'fetch-depth': 0, clean: true } })
    const tagIndex = steps.findIndex(step => step.name === 'Verify selected release tag before installing code')
    const installIndex = steps.findIndex(step => step.name === 'Install (immutable)')
    expect(tagIndex).toBeGreaterThan(-1)
    expect(tagIndex).toBeLessThan(installIndex)
    expect(steps.find(step => step.name === 'Build and package signed Desktop artifact')).toMatchObject({
      run: 'pnpm run package:desktop:win:x64 -- --profile $env:DSH_CLIENT_PROFILE',
    })
    const packText = JSON.stringify(pack)
    expect(packText).toContain('DSH_DESKTOP_WINDOWS_TOKEN_PIN')
    expect(packText).not.toMatch(/DOWNLOAD_(?:TEST|PROD)_COS_(?:BUCKET|SECRET_ID|SECRET_KEY)/u)
    const upload = steps.find(step => step.uses === 'actions/upload-artifact@v4')
    expect(upload).toMatchObject({
      with: {
        path: '.desktop-build/windows-desktop-release',
        'if-no-files-found': 'error',
      },
    })
    expect(steps.find(step => step.name === 'Stage artifact provenance')?.run).toContain('artifactHashes')
  })

  it('publishes only the downloaded artifact and keeps COS credentials in the publish job', () => {
    const document = workflow()
    const publish = job(document, 'publish')
    expect(publish.if).toBe('inputs.publish')
    expect(publish.needs).toBe('pack')
    expect(publish['runs-on']).toBe('ubuntu-24.04')
    expect(publish.environment).toBe('desktop-${{ inputs.environment }}')
    const steps = stepsOf(publish)
    expect(steps.find(step => step.uses === 'actions/checkout@v6')).toMatchObject({ with: { ref: '${{ inputs.ref }}' } })
    expect(steps.find(step => step.uses === 'actions/download-artifact@v4')).toMatchObject({
      with: {
        name: '${{ needs.pack.outputs.artifact_name }}',
        path: '.desktop-build/downloaded-desktop-release',
      },
    })
    const publishText = JSON.stringify(publish)
    expect(publishText).toContain('DOWNLOAD_TEST_COS_SECRET_ID')
    expect(publishText).toContain('DOWNLOAD_PROD_COS_SECRET_ID')
    expect(publishText).not.toContain('package:desktop:win:x64')
    expect(steps.find(step => step.name === 'Upload validated Windows Desktop release')).toMatchObject({
      run: 'pnpm run upload:win:x64',
    })
    expect(publishText).toContain('apps/desktop/.desktop-build/targets/win-x64/artifacts')
  })
})
