/** Client type face for the generated Sub2API Remote namespace. */

export type {
  Sub2apiAccountSnapshot,
  Sub2apiAccountSummary,
  Sub2apiLoginInput,
  Sub2apiModelDescriptor,
  Sub2apiRegisterInput,
  Sub2apiStateView,
  Sub2apiTwoFactorInput,
  Sub2apiUsageSnapshot,
} from '../types.ts'

/** No browser runtime is mounted by the owner; api-remotes mounts its Remote artifact. */
export const inject = ['remote.sub2api']
