import './zod-meta.js';

export {
    Kizuna,
    type K,
    type KizunaSpec,
    type TagNamesOf,
    type IdentityNamesOf,
    type RouteAuthValue,
    type RouteAuthRule,
} from './kizuna.js';
export {
    type Contract,
    type RoutesOf,
    type SchemesOf,
    type RequestContextOf,
    type ContractPluginsOf,
    type JobsOf,
    type GuardSchemaOf,
} from './contract.js';
export {
    createPlugin,
    type PluginDeclaration,
    type PluginDefinition,
    type PluginRoutes,
    type ContractPlugins,
    type PluginExportValues,
    type PluginArgs,
    type PluginRoutesOf,
    type PluginPropsOf,
    type PluginExportsOf,
} from './plugin.js';
export { type ModelOptions } from './model.js';
export { type TagOptions, type TagSet, type TagKeysOf, type NormalizeTags } from './tags.js';
export {
    type Identity,
    type Credential,
    type NoCredential,
    type CredentialOf,
    type RolesOf,
    type IdentityParamsOf,
    type RoleOf,
    type GrantsOf,
    type GuardHoldings,
    type IdentityRole,
    type BearerCredential,
    type BasicCredential,
    type ApiKeyCredential,
} from './identity.js';
export {
    isPermissions,
    isRoles,
    type Permissions,
    type PermissionCatalog,
    type PermissionName,
    type PermissionSet,
    type RoleDefinition,
    type Roles,
    type RoleNamesOf,
    type CatalogOf,
    type GrantNamesOf,
} from './permissions.js';
export { type RequestContextSchema, type RequestContextHeaderInputs, type RequestContextHeaderValues } from './request-context.js';
export {
    isSecurityScheme,
    authorizationServerIssuer,
    declaredScopes,
    type SecurityScheme,
    type ContextOf,
    type OpenApiSecuritySchemeObject,
    type OAuthFlow,
    type OAuthFlows,
} from './security-scheme.js';
export { type CodedIssue, type RegisteredIssue } from './coded-issue.js';
export {
    isValidationError,
    type ValidationError,
    type ValidationErrorFor,
    type ValidationIssueCode,
    type BuiltinIssueCode,
} from './validation-error.js';
export { isProblemDetails } from './error-response.js';
export {
    type JobDefinition,
    type AuthoredJobs,
    type Jobs,
    type CompiledJob,
    type JobResponses,
    type JobHandler,
    type JobHandlers,
    type JobHandlerArgs,
    type JobHandlerReturn,
    type JobsArg,
    type JobsConfig,
    type CompiledJobs,
    type FlattenedJob,
    type NoJobs,
    isCompiledJob,
    isJobDefinition,
    flattenJobs,
    jobAt,
} from './jobs.js';
export {
    dueJobs,
    dispatchDueJobs,
    dispatchSucceeded,
    failedJobs,
    DispatchResultSchema,
    DispatchFailedSchema,
    type DispatchOptions,
    type DispatchOutcome,
    type DispatchResult,
} from './job-dispatch.js';
export {
    createJobRunner,
    jobFnAt,
    JobInputError,
    type JobRunner,
    type JobRunnerOptions,
    type JobErrorHandler,
    type JobFn,
    type JobFnByKey,
    type JobRunArgs,
    type JobQueueArgs,
    type JobQueueOptions,
} from './job-runner.js';
export {
    toolEvents,
    expandStreamTools,
    type StreamWithTools,
    type ToolEvents,
    type ToolCall,
    type ToolResult,
    type ToolError,
    type ToolKeys,
    type ToolAt,
} from './tool-events.js';
export { readToolCalls, type ToolCallRecord, type ToolCallState, type ToolCallMessage } from './tool-records.js';
export {
    createJobTransport,
    JobDispatchError,
    type JobTransport,
    type JobTransportDefinition,
    type JobTransportSupports,
    type JobMessage,
    type JobDescriptor,
    type ScheduledJob,
    type JobWorker,
    type JobWorkerContext,
} from './job-transport.js';
export {
    type JobSchedule,
    type ParsedCron,
    parseCron,
    nextRun,
    nextRuns,
    firesBetween,
    dueSchedules,
    scheduleExpression,
    scheduleTimezone,
    assertValidSchedule,
    cron,
} from './schedule.js';
export {
    problemDetails,
    problemFromBody,
    type ProblemDetails,
    type StripProblemEnvelope,
    type GuardBody,
    type GuardOutput,
} from './problem-details.js';
export {
    buildProtectedResourceMetadata,
    assertCanonicalResourceUri,
    type ProtectedResourceMetadata,
    type ProtectedResourceConfig,
} from './protected-resource-metadata.js';
export { ResponseError } from './response-error.js';
export { STATUS_TITLES, getStatusText } from './status-titles.js';
export { getHeaderValue } from './adapter.js';
export { isStreamResponse, isZodSchema } from './generator-utils.js';
export {
    streamMode,
    streamContentType,
    isNamedStream,
    streamStatuses,
    routeStreams,
    soleStreamResponse,
    EVENT_STREAM_MEDIA_TYPE,
    type StreamMode,
    type StreamContext,
    type StreamComment,
    type StreamYield,
    type StreamMessage,
    type StreamChunk,
    type StreamMessageOf,
    type StreamBodyOf,
    type StreamBody,
} from './stream.js';

export { METHODS } from './types.js';
export {
    type CachePolicy,
    type Method,
    type ResponseContentType,
    type ResponseDefinition,
    type StreamDefinition,
    type StreamResponseDefinition,
    type SecurityRequirement,
    type SchemeNameOf,
    type RequiredPermissions,
    type RouteAuth,
    type RouteDefinition,
    type RouteHandlerFunction,
    type RoutePath,
    type Routes,
    type AuthoredRouteDefinition,
    type AuthoredRoutes,
} from './types.js';
export { buildPath, parsePath, type ExtractPathParams, type PathParamName, type HasPathParams } from './path-params.js';
export { type AuthCheck, type RouteAuthCheck } from './auth-check.js';
export { type JobFnOf, type JobsOfTree, type KizunaConfigShape } from './configured.js';
export { defineConfig, type KizunaConfigInput, type ConfiguredApi } from './define-config.js';
export { DECLARATION, type DeclarationKind, type RouteToolOptions } from './types.js';
export { isRouteDefinition } from './handler-pipeline.js';
export { type Api, type ApiImplementations } from './api.js';
export { type RouteBuilder, type RouteWithHandler } from './route.js';
export { type JobBuilder, type JobWithHandler, type JobHandlerFor } from './job.js';
export {
    type AuthContextOf,
    type ContextFromAuth,
    type HandlerArgs,
    type HandlerReturn,
    type ThrowableReturn,
    type GuardSuccess,
    type GuardReturn,
    type RoutesWithHandlerContext,
    type BrandedHandlerContext,
    type GuardAnswer,
} from './handler-pipeline.js';
export { type HandlerContextBrand, HANDLER_CONTEXT_BRAND } from './types.js';
export { type AutoResponsesBrand, AUTO_RESPONSES_BRAND, AUTO_GUARD_BRAND, AUTO_GUARD_WRITTEN_BRAND, type GuardStatus } from './types.js';
export { apiEntries, type ApiEntry, type ClientTarget } from './config.js';
export { type AnyPlugin, type PluginList, type PluginsBySlug } from './plugin.js';
export { RESOLVER, type RequestContextBuilder, type RequestContextWithHandler } from './request-context-builder.js';
export { GUARD, type IdentityBuilder, type IdentityWithGuard, type GuardFor, type IdentityFactories } from './identity-builder.js';
