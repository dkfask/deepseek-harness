/** Host Remote owner for the secret-free Sub2API account projection. */

import { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { Sub2apiError } from './errors.ts'
import type { Sub2apiRuntime } from './service.ts'
import type {
  Sub2apiAccountSnapshot,
  Sub2apiGroupDescriptor,
  Sub2apiLoginInput,
  Sub2apiModelDescriptor,
  Sub2apiModelSettingsInput,
  Sub2apiPublicSettings,
  Sub2apiRegisterInput,
  Sub2apiStateView,
  Sub2apiTwoFactorInput,
  Sub2apiUsageSnapshot,
} from './types.ts'

/** Host service backing `ctx.remote.sub2api`. */
export class Sub2apiRemoteController extends TypertRemoteService {
  static inject = ['sub2api']

  constructor(ctx: Context) {
    super(ctx, 'sub2apiRemote', { namespace: 'sub2api' })
  }

  /**
   * Return the current secret-free state projection.
   * @returns Current account state.
   */
  @Remote('getState')
  async getState(): Promise<Sub2apiStateView> {
    await this.runtime().hydrate()
    return this.runtime().state()
  }

  /** Register an account without returning authentication material.
   * @param input - Registration fields.
   * @param signal - Cancellation signal for the account request.
   * @returns Updated account state.
   */
  @Remote('register')
  async register(input: Sub2apiRegisterInput, signal: AbortSignal): Promise<Sub2apiStateView> {
    await this.run(() => this.runtime().register(input, signal))
    return this.runtime().state()
  }

  /** Sign in an account without returning authentication material.
   * @param input - Login fields.
   * @param signal - Cancellation signal for the account request.
   * @returns Updated account state.
   */
  @Remote('login')
  async login(input: Sub2apiLoginInput, signal: AbortSignal): Promise<Sub2apiStateView> {
    await this.run(() => this.runtime().login(input, signal))
    return this.runtime().state()
  }

  /** Complete a pending second-factor challenge.
   * @param input - Second-factor challenge fields.
   * @param signal - Cancellation signal for the verification request.
   * @returns Updated account state.
   */
  @Remote('submit2FA')
  async submit2FA(input: Sub2apiTwoFactorInput, signal: AbortSignal): Promise<Sub2apiStateView> {
    await this.run(() => this.runtime().submit2FA(input, signal))
    return this.runtime().state()
  }

  /** Clear the local account projection and managed credential record.
   * @returns Cleared account state.
   */
  @Remote('logout')
  async logout(): Promise<Sub2apiStateView> {
    await this.run(() => this.runtime().logout())
    return this.runtime().state()
  }

  /** Refresh the account projection.
   * @param signal - Cancellation signal for the account request.
   * @returns Refreshed account snapshot.
   */
  @Remote('refreshAccount')
  refreshAccount(signal: AbortSignal): Promise<Sub2apiAccountSnapshot> {
    return this.run(() => this.runtime().refreshAccount(signal))
  }

  /** Refresh the model catalog without exposing a managed API Key.
   * @param signal - Cancellation signal for the model request.
   * @returns Refreshed model descriptors.
   */
  @Remote('refreshModels')
  refreshModels(signal: AbortSignal): Promise<readonly Sub2apiModelDescriptor[]> {
    return this.run(() => this.runtime().refreshModels(signal))
  }

  /** Save a model's context-window setting and return the updated state. */
  @Remote('updateModelSettings')
  async updateModelSettings(input: Sub2apiModelSettingsInput): Promise<Sub2apiStateView> {
    await this.run(() => this.runtime().updateModelSettings(input))
    return this.runtime().state()
  }

  /** Return named groups available to the authenticated account.
   * @param signal - Cancellation signal for the group request.
   * @returns Named group descriptors without account secrets.
   */
  @Remote('getAvailableGroups')
  getAvailableGroups(signal: AbortSignal): Promise<readonly Sub2apiGroupDescriptor[]> {
    return this.run(() => this.runtime().getAvailableGroups(signal))
  }

  /** Update the authenticated user's managed API Key group.
   * @param groupId - positive server-side group identifier.
   * @param signal - cancellation signal for the account request.
   * @returns Updated account state.
   */
  @Remote('updateManagedKeyGroup')
  async updateManagedKeyGroup(groupId: number, signal: AbortSignal): Promise<Sub2apiStateView> {
    await this.run(() => this.runtime().updateManagedKeyGroup(groupId, signal))
    return this.runtime().state()
  }

  /** Refresh bounded usage and balance data.
   * @param signal - Cancellation signal for the usage request.
   * @returns Refreshed usage snapshot.
   */
  @Remote('getUsage')
  getUsage(signal: AbortSignal): Promise<Sub2apiUsageSnapshot> {
    return this.run(() => this.runtime().getUsage(signal))
  }

  /** Read unauthenticated deployment capability settings.
   * @param signal - Cancellation signal for the public-settings request.
   * @returns Public settings, or `undefined` when the profile has no endpoint.
   */
  @Remote('getPublicSettings')
  getPublicSettings(signal: AbortSignal): Promise<Sub2apiPublicSettings | undefined> {
    return this.run(() => this.runtime().getPublicSettings(signal))
  }

  /** Return a profile-approved recharge URL.
   * @param signal - Cancellation signal for the billing request.
   * @returns Validated recharge URL when the deployment provides one.
   */
  @Remote('getRechargeUrl')
  getRechargeUrl(signal: AbortSignal): Promise<string | undefined> {
    return this.run(() => this.runtime().getRechargeUrl(signal))
  }

  private runtime(): Sub2apiRuntime {
    return this.ctx.sub2api
  }

  private async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation()
    } catch (error: unknown) {
      throw sub2apiRemoteError(error)
    }
  }
}

/** Convert a Host failure to a stable, secret-free Remote failure. */
function sub2apiRemoteError(error: unknown): RemoteError {
  if (error instanceof Sub2apiError) {
    return new RemoteError('sub2api/failed', error.message, {
      code: error.code,
      retryable: error.retryable,
      ...(error.httpStatus === undefined ? {} : { httpStatus: error.httpStatus }),
      ...(error.retryAfterMs === undefined ? {} : { retryAfterMs: error.retryAfterMs }),
      ...(error.compliance === undefined ? {} : { compliance: error.compliance }),
    })
  }
  return new RemoteError('sub2api/failed', 'Sub2API operation failed', {
    code: 'SUB2API_SERVICE_UNAVAILABLE',
    retryable: false,
  }, { cause: error })
}

export default Sub2apiRemoteController
