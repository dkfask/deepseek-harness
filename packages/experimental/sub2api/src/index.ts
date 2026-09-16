/** Experimental Host-side protocol and account-state foundation for Sub2API. @module @deepseek-ai/dsh-experimental-sub2api */

export { Sub2apiError, isSub2apiError } from './errors.ts'
export {
  MemorySub2apiCredentialStore,
  parseSub2apiFixture,
  Sub2apiFixtureReplay,
  Sub2apiFixtureTransport,
  sub2apiFixtureJson,
} from './fixtures.ts'
export { Sub2apiHttpClient } from './http.ts'
export { isSub2apiRecord, parseSub2apiPayload } from './protocol.ts'
export type {
  Sub2apiFixtureDocument,
  Sub2apiFixtureExchange,
  Sub2apiFixtureHandler,
  Sub2apiFixtureRequest,
} from './fixtures.ts'
export type {
  Sub2apiDestinationValidator,
  Sub2apiFetch,
  Sub2apiHttpBase,
  Sub2apiHttpClientOptions,
  Sub2apiHttpCredential,
  Sub2apiHttpMethod,
  Sub2apiHttpRequest,
  Sub2apiHttpResponse,
} from './http.ts'
export type { Sub2apiErrorCode, Sub2apiErrorOptions } from './errors.ts'
export {
  normalizeSub2apiOrigin,
  resolveSub2apiProfile,
  sub2apiDeploymentFingerprint,
  sub2apiUrl,
} from './profile.ts'
export type { Sub2apiProfileInput } from './profile.ts'
export { parseSub2apiGrantRecord, redactSub2apiGrantRecord, sub2apiSecret } from './record.ts'
export { applySub2apiStateEvent, createSub2apiSnapshot, Sub2apiGenerationGuard } from './state.ts'
export {
  createStandardSub2apiCodec,
  SUB2API_RECORD_KEY,
  Sub2apiRuntimeService,
} from './service.ts'
export { Sub2apiService } from './cordis.ts'
export { Sub2apiLlmProvider } from './llm.ts'
export { Sub2apiRemoteController } from './remote.ts'
export { parseSub2apiCompatibilityMatrix, SUB2API_LOCKED_BASELINE } from './compatibility.ts'
export type {
  Sub2apiCompatibilityMatrix,
  Sub2apiCompatibilityRow,
  Sub2apiCompatibilityStatus,
} from './compatibility.ts'
export type {
  Sub2apiCredentialStore,
  Sub2apiProtocolCodec,
  Sub2apiRuntime,
  Sub2apiRuntimeOptions,
} from './service.ts'
export type { Sub2apiServiceOptions } from './cordis.ts'
export type { Sub2apiLlmOptions } from './llm.ts'
export type {
  Sub2apiAccountPaths,
  Sub2apiAccountSnapshot,
  Sub2apiAccountSummary,
  Sub2apiApiKeyDescriptor,
  Sub2apiAuthenticationGrant,
  Sub2apiAuthenticationResult,
  Sub2apiAuthState,
  Sub2apiDeploymentFingerprint,
  Sub2apiGatewayAuthScheme,
  Sub2apiGatewayPaths,
  Sub2apiGatewayCredential,
  Sub2apiGrantRecordRedacted,
  Sub2apiGrantRecordV1,
  Sub2apiLoginInput,
  Sub2apiModelDescriptor,
  Sub2apiProtocolProfile,
  Sub2apiRegisterInput,
  Sub2apiResponseEnvelope,
  Sub2apiRuntimeSnapshot,
  Sub2apiSecret,
  Sub2apiStateEvent,
  Sub2apiStateView,
  Sub2apiTwoFactorChallenge,
  Sub2apiTwoFactorInput,
  Sub2apiUsageSnapshot,
} from './types.ts'
