import type { AdapterFeatureMeta, AdapterName } from './features.js';

export const ADAPTER_TYPE_FEATURES = {
    'surface.router': {
        summary: '`Router<C>` resolves to the handler tree core derives for the adapter’s handler context.',
    },
    'surface.routeHandler': {
        summary: '`RouteHandler<R>` resolves to core’s handler for the adapter’s handler context.',
    },
    'surface.guardRun': {
        summary: '`k.identity.*(…).guard` returns a `GuardRun` over the adapter’s handler context.',
    },
    'surface.requestContextRun': {
        summary: '`k.requestContext(…).handler` returns a `RequestContextRun` over the adapter’s handler context.',
    },
    'router.undeclaredStatus': {
        summary: 'A status the route does not declare is refused.',
    },
    'handler.pathParams': {
        summary: 'Path params reach the handler typed from the path.',
    },
    'handler.body': {
        summary: 'A declared body reaches the handler typed.',
    },
    'handler.context': {
        summary: 'Handler args carry the adapter’s own handler context.',
    },
    'guards.identityContext': {
        summary: 'A secured handler receives each required identity’s context under `auth`.',
    },
    'guards.publicNoAuth': {
        summary: 'A handler for a route the contract marks public has no `auth` arg.',
    },
    'guards.gateOnlyNoAuth': {
        summary: 'An identity with no context schema gates the route without adding an `auth` arg.',
    },
    'guards.credentialByKind': {
        summary: 'A guard’s credential is typed by the identity’s authentication method.',
    },
    'guards.returnChecked': {
        summary: 'A guard’s return is checked against its identity’s context schema.',
    },
    'guards.gateOnlyVoid': {
        summary: 'A gate-only guard may return void; a context-ful one may not.',
    },
    'guards.unknownIdentity': {
        summary: 'An identity the config does not declare is refused.',
    },
    'requestContext.handlerArg': {
        summary: 'Handlers receive typed `requestContext` on every route.',
    },
    'requestContext.guardArg': {
        summary: 'Guards receive the same typed `requestContext` handlers do.',
    },
    'requestContext.resolverReturn': {
        summary: 'A resolver’s return is checked against its schema.',
    },
    'requestContext.unknownKey': {
        summary: 'A context key the contract does not declare is refused.',
    },
    'standalone.routeHandlerAuth': {
        summary: 'A standalone `RouteHandler` carries the route’s auth and drops into the group router.',
    },
    'standalone.routeHandlerContext': {
        summary: 'A standalone `RouteHandler` carries the contract’s request context.',
    },
    'standalone.routeGroupContractArgs': {
        summary: 'A router typed from a route group carries the contract’s plugins and jobs.',
    },
    'standalone.routeHandlerContractArgs': {
        summary: 'A standalone `RouteHandler` carries the contract’s plugins and jobs.',
    },
    'plugins.exportsTyped': {
        summary: 'A handler’s `plugins` carries each installed plugin’s exports, typed and keyed by install name.',
    },
    'plugins.absentWhenUninstalled': {
        summary: 'A contract with no plugins gives handlers no `plugins` key at all.',
    },
    'streams.bodyGenerator': {
        summary: 'An inline async generator on a streamed status infers its event names as literals and checks each `data` payload.',
    },
    'streams.bodyRejectsValue': {
        summary: 'A plain value is refused as the body of a streamed status, and `throwError` refuses a streamed status.',
    },
} as const satisfies Record<string, AdapterFeatureMeta>;

export type AdapterTypeFeature = keyof typeof ADAPTER_TYPE_FEATURES;

/**
 * Nothing to run: the bodies are checked where they are written, and the exhaustive `Record` is what fails an adapter
 * that leaves a feature unanswered.
 */
export const checkAdapterTypeFeatures = (_adapter: AdapterName, _features: Record<AdapterTypeFeature, () => void>): void => {};
