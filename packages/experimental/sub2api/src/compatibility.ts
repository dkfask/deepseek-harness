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
