import { Sub2apiError } from './errors.ts'

/** Locked source revision required for every V1 compatibility assessment. */
export const SUB2API_LOCKED_BASELINE = '881f3202694c6bc932446931a30c27d9675178b9'

/** Evidence status for one baseline/target capability pair. */
export type Sub2apiCompatibilityStatus = 'not-provided' | 'synthetic' | 'verified'

/** One capability row in the target-bound compatibility matrix. */
export interface Sub2apiCompatibilityRow {
  readonly capability: string
  readonly priority: 'P0' | 'P1'
  readonly baselineStatus: Sub2apiCompatibilityStatus
  readonly targetStatus: Sub2apiCompatibilityStatus
  readonly fixtureStatus: Sub2apiCompatibilityStatus
  readonly strategy: string
  readonly targetEvidenceRequired: boolean
}

/** Versioned compatibility matrix retained with the protocol fixtures. */
export interface Sub2apiCompatibilityMatrix {
  readonly schemaVersion: 1
  readonly lockedBaseline: typeof SUB2API_LOCKED_BASELINE
  readonly targetDeployment: string
  readonly rows: readonly Sub2apiCompatibilityRow[]
}

/** One redacted observation captured from an actual Sub2API deployment. */
export interface Sub2apiTargetEvidenceObservation {
  readonly capability: string
  readonly request: {
    readonly method: string
    readonly path: string
  }
  readonly status: number
  readonly response?: {
    readonly contentType?: string
    readonly topLevelFields: readonly string[]
    readonly dataFields?: readonly string[]
    readonly itemCount?: number
    readonly streamTerminated?: boolean
  }
}

/** Redacted target evidence kept separately from synthetic protocol fixtures. */
export interface Sub2apiTargetEvidence {
  readonly schemaVersion: 1
  readonly lockedBaseline: typeof SUB2API_LOCKED_BASELINE
  readonly targetDeployment: string
  readonly observations: readonly Sub2apiTargetEvidenceObservation[]
}

/**
 * Parse redacted target observations without accepting credential values as evidence.
 * @param value - untrusted target-evidence JSON.
 * @returns a frozen target-evidence document.
 */
export function parseSub2apiTargetEvidence(value: unknown): Sub2apiTargetEvidence {
  const root = record(value, 'target evidence')
  if (root.schemaVersion !== 1) throw matrixError('target evidence schemaVersion must be 1')
  if (root.lockedBaseline !== SUB2API_LOCKED_BASELINE) throw matrixError('target evidence baseline is not the locked source revision')
  const targetDeployment = nonEmpty(root.targetDeployment, 'targetDeployment')
  if (!Array.isArray(root.observations) || root.observations.length === 0) throw matrixError('target evidence observations must be non-empty')
  const seen = new Set<string>()
  const observations = root.observations.map((entry, index) => {
    const item = record(entry, `target observation ${index + 1}`)
    const capability = nonEmpty(item.capability, `target observation ${index + 1} capability`)
    if (seen.has(capability)) throw matrixError(`target evidence repeats capability ${capability}`)
    seen.add(capability)
    const request = record(item.request, `${capability} request`)
    const method = nonEmpty(request.method, `${capability} request method`)
    const path = nonEmpty(request.path, `${capability} request path`)
    const statusValue = item.status
    if (typeof statusValue !== 'number' || !Number.isSafeInteger(statusValue) || statusValue < 100 || statusValue > 599) throw matrixError(`${capability} status must be an HTTP status`)
    const status = statusValue
    const response = item.response === undefined ? undefined : parseObservationResponse(item.response, capability)
    return Object.freeze({ capability, request: Object.freeze({ method, path }), status, ...(response === undefined ? {} : { response }) })
  })
  return Object.freeze({
    schemaVersion: 1,
    lockedBaseline: SUB2API_LOCKED_BASELINE,
    targetDeployment,
    observations: Object.freeze(observations),
  })
}

/**
 * Parse the matrix at the evidence boundary. A synthetic fixture cannot be
 * mistaken for target evidence: every row records the two statuses separately.
 * @param value - untrusted JSON matrix.
 * @returns a frozen compatibility matrix.
 */
export function parseSub2apiCompatibilityMatrix(value: unknown): Sub2apiCompatibilityMatrix {
  const root = record(value, 'compatibility matrix')
  if (root.schemaVersion !== 1) throw matrixError('compatibility matrix schemaVersion must be 1')
  if (root.lockedBaseline !== SUB2API_LOCKED_BASELINE) throw matrixError('compatibility matrix baseline is not the locked source revision')
  const targetDeployment = nonEmpty(root.targetDeployment, 'targetDeployment')
  if (!Array.isArray(root.rows) || root.rows.length === 0) throw matrixError('compatibility matrix rows must be non-empty')
  const seen = new Set<string>()
  const rows = root.rows.map((entry, index) => {
    const row = record(entry, `compatibility row ${index + 1}`)
    const capability = nonEmpty(row.capability, `compatibility row ${index + 1} capability`)
    if (seen.has(capability)) throw matrixError(`compatibility matrix repeats capability ${capability}`)
    seen.add(capability)
    const priorityValue = row.priority
    if (priorityValue !== 'P0' && priorityValue !== 'P1') throw matrixError(`${capability} priority must be P0 or P1`)
    const priority: Sub2apiCompatibilityRow['priority'] = priorityValue
    const targetEvidenceRequired = row.targetEvidenceRequired
    if (typeof targetEvidenceRequired !== 'boolean') throw matrixError(`${capability} targetEvidenceRequired must be boolean`)
    const parsed = {
      capability,
      priority,
      baselineStatus: status(row.baselineStatus, `${capability} baselineStatus`),
      targetStatus: status(row.targetStatus, `${capability} targetStatus`),
      fixtureStatus: status(row.fixtureStatus, `${capability} fixtureStatus`),
      strategy: nonEmpty(row.strategy, `${capability} strategy`),
      targetEvidenceRequired,
    }
    return Object.freeze(parsed)
  })
  return Object.freeze({
    schemaVersion: 1,
    lockedBaseline: SUB2API_LOCKED_BASELINE,
    targetDeployment,
    rows: Object.freeze(rows),
  })
}

function status(value: unknown, label: string): Sub2apiCompatibilityStatus {
  if (value === 'not-provided' || value === 'synthetic' || value === 'verified') return value
  throw matrixError(`${label} must be not-provided, synthetic, or verified`)
}

function parseObservationResponse(value: unknown, capability: string): Sub2apiTargetEvidenceObservation['response'] {
  const response = record(value, `${capability} response`)
  const contentType = response.contentType
  if (contentType !== undefined && typeof contentType !== 'string') throw matrixError(`${capability} contentType must be a string`)
  const topLevelFields = stringList(response.topLevelFields, `${capability} topLevelFields`)
  const dataFields = response.dataFields === undefined ? undefined : stringList(response.dataFields, `${capability} dataFields`)
  const itemCountValue = response.itemCount
  let itemCount: number | undefined
  if (itemCountValue !== undefined) {
    if (typeof itemCountValue !== 'number' || !Number.isSafeInteger(itemCountValue) || itemCountValue < 0) throw matrixError(`${capability} itemCount must be a non-negative integer`)
    itemCount = itemCountValue
  }
  const streamTerminated = response.streamTerminated
  if (streamTerminated !== undefined && typeof streamTerminated !== 'boolean') throw matrixError(`${capability} streamTerminated must be boolean`)
  return Object.freeze({
    ...(contentType === undefined ? {} : { contentType }),
    topLevelFields: Object.freeze(topLevelFields),
    ...(dataFields === undefined ? {} : { dataFields: Object.freeze(dataFields) }),
    ...(itemCount === undefined ? {} : { itemCount }),
    ...(streamTerminated === undefined ? {} : { streamTerminated }),
  })
}

function stringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.trim() === '')) throw matrixError(`${label} must be a string list`)
  return [...new Set(value)]
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value === 'string' && value.trim() !== '') return value
  throw matrixError(`${label} must be a non-empty string`)
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw matrixError(`${label} must be an object`)
  return value as Record<string, unknown>
}

function matrixError(message: string): Sub2apiError {
  return new Sub2apiError('SUB2API_PROTOCOL_MISMATCH', message)
}
