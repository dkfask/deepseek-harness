import { Sub2apiError } from './errors.ts'
import type {
  Sub2apiAuthState,
  Sub2apiRuntimeSnapshot,
  Sub2apiStateEvent,
} from './types.ts'

const ALLOWED_TRANSITIONS: Readonly<Record<Sub2apiAuthState, readonly Sub2apiStateEvent['type'][]>> = {
  'signed-out': ['begin-authentication'],
  authenticating: ['two-factor-required', 'authenticated', 'reauth-required', 'begin-sign-out'],
  'two-factor-required': ['authenticated', 'reauth-required', 'begin-sign-out'],
  authenticated: ['begin-refresh', 'reauth-required', 'key-required', 'insufficient-balance', 'begin-sign-out', 'credential-replaced', 'deployment-changed'],
  refreshing: ['refresh-succeeded', 'reauth-required', 'key-required', 'insufficient-balance', 'begin-sign-out'],
  'reauth-required': ['begin-authentication', 'begin-refresh', 'begin-sign-out'],
  'key-required': ['begin-authentication', 'authenticated', 'reauth-required', 'begin-sign-out', 'credential-replaced'],
  'insufficient-balance': ['begin-authentication', 'authenticated', 'reauth-required', 'begin-refresh', 'begin-sign-out'],
  'signing-out': ['signed-out'],
}

/**
 * Create a deterministic initial signed-out snapshot.
 * @param at - non-negative snapshot timestamp.
 * @returns the initial runtime snapshot.
 */
export function createSub2apiSnapshot(at: number): Sub2apiRuntimeSnapshot {
  return { status: 'signed-out', generation: 0, updatedAt: requireTimestamp(at) }
}

/**
 * Apply one lifecycle event and reject impossible state transitions.
 * @param snapshot - current runtime snapshot.
 * @param event - lifecycle event to apply.
 * @returns the next runtime snapshot.
 */
export function applySub2apiStateEvent(
  snapshot: Sub2apiRuntimeSnapshot,
  event: Sub2apiStateEvent,
): Sub2apiRuntimeSnapshot {
  requireTimestamp(event.at)
  const allowed = ALLOWED_TRANSITIONS[snapshot.status]
  if (!allowed.includes(event.type)) {
    throw new Sub2apiError(
      'SUB2API_BAD_REQUEST',
      `sub2api state: ${event.type} is not valid while ${snapshot.status}`,
    )
  }
  const status = nextStatus(event)
  const account = event.type === 'authenticated' || event.type === 'refresh-succeeded'
    ? event.account
    : event.type === 'signed-out' ? undefined : snapshot.account
  const error = stateError(status)
  return {
    status,
    generation: snapshot.generation + (advancesGeneration(snapshot.status, event.type) ? 1 : 0),
    ...(account === undefined ? {} : { account }),
    ...(error === undefined ? {} : { error }),
    updatedAt: event.at,
  }
}

/** A monotone guard used to discard results from superseded account operations. */
export class Sub2apiGenerationGuard {
  private generation: number

  /**
   * Create a guard at a known persisted generation.
   * @param initial - non-negative generation restored from a durable record.
   */
  constructor(initial = 0) {
    if (!Number.isSafeInteger(initial) || initial < 0) {
      throw new Sub2apiError('SUB2API_BAD_REQUEST', 'sub2api generation: initial value must be a non-negative integer')
    }
    this.generation = initial
  }

  /** The current operation generation. */
  get current(): number {
    return this.generation
  }

  /**
   * Advance the generation after login, logout, credential replacement, or deployment change.
   * @returns the new generation.
   */
  advance(): number {
    this.generation += 1
    return this.generation
  }

  /**
   * Restore a durable generation without allowing it to move backwards.
   * @param value - persisted generation to restore.
   */
  restore(value: number): void {
    if (!Number.isSafeInteger(value) || value < this.generation) {
      throw new Sub2apiError('SUB2API_BAD_REQUEST', 'sub2api generation: restored value is invalid or older than the current value')
    }
    this.generation = value
  }

  /**
   * Capture the current generation for an async operation.
   * @returns the captured generation.
   */
  capture(): number {
    return this.generation
  }

  /**
   * Whether an async result still belongs to the current generation.
   * @param captured - generation captured before the async operation.
   * @returns whether the captured generation is still current.
   */
  isCurrent(captured: number): boolean {
    return captured === this.generation
  }
}

function nextStatus(event: Sub2apiStateEvent): Sub2apiAuthState {
  switch (event.type) {
    case 'begin-authentication': return 'authenticating'
    case 'two-factor-required': return 'two-factor-required'
    case 'authenticated': return 'authenticated'
    case 'begin-refresh': return 'refreshing'
    case 'refresh-succeeded': return 'authenticated'
    case 'reauth-required': return 'reauth-required'
    case 'key-required': return 'key-required'
    case 'insufficient-balance': return 'insufficient-balance'
    case 'begin-sign-out': return 'signing-out'
    case 'signed-out': return 'signed-out'
    case 'credential-replaced': return 'authenticated'
    case 'deployment-changed': return 'authenticated'
  }
}

function stateError(status: Sub2apiAuthState): Sub2apiRuntimeSnapshot['error'] {
  switch (status) {
    case 'reauth-required': return { code: 'SUB2API_REAUTH_REQUIRED', message: '重新认证后才能继续使用 Sub2API。', retryable: false }
    case 'key-required': return { code: 'SUB2API_KEY_REQUIRED', message: '当前账户还没有可用的托管 API Key。', retryable: false }
    case 'insufficient-balance': return { code: 'SUB2API_INSUFFICIENT_BALANCE', message: 'Sub2API 账户余额不足。', retryable: false }
    default: return undefined
  }
}

function advancesGeneration(status: Sub2apiAuthState, event: Sub2apiStateEvent['type']): boolean {
  if (event === 'begin-sign-out' || event === 'credential-replaced' || event === 'deployment-changed') return true
  return event === 'authenticated'
    && (status === 'authenticating' || status === 'two-factor-required' || status === 'reauth-required')
}

function requireTimestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Sub2apiError('SUB2API_BAD_REQUEST', 'sub2api state: timestamp must be a non-negative integer')
  }
  return value
}
