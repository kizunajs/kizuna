import type {
    DataTag,
    DefaultError,
    InfiniteData,
    InfiniteQueryObserverOptions,
    MutationObserverOptions,
    QueryFunction,
    QueryFunctionContext,
    QueryObserverOptions,
    SkipToken,
} from '@tanstack/query-core';
import type { RouteDefinition, Routes, StreamResponseDefinition } from 'kizunajs';
import type { Client, ClientArgs, ClientMethod, ClientResponse } from '@kizunajs/fetch';

export type KizunaQueryKeyType = 'query' | 'infinite' | 'stream';

/**
 * `[segments, { input, type }]`, for example
 * `[['users', 'getUser'], { input: { params: { id: '1' } }, type: 'query' }]`.
 */
export type KizunaQueryKey = readonly [readonly string[], { readonly input?: unknown; readonly type: KizunaQueryKeyType }];

/**
 * `[segments]`, the prefix every operation under a route or group matches.
 */
export type KizunaPathKey = readonly [readonly string[]];

type HasOptionalArgs<Args> = {} extends Args ? true : false;

type CallFn<Args, Result> = HasOptionalArgs<Args> extends true ? (args?: Args) => Promise<Result> : (args: Args) => Promise<Result>;

// From `query-core`, so no framework's option type is named. `TData` stays
// `unknown` because the framework re-infers the selected type from `U`.
type QueryExtras<TQueryFnData, TError> = Omit<
    QueryObserverOptions<TQueryFnData, TError, unknown, TQueryFnData, KizunaQueryKey>,
    'queryKey' | 'queryFn'
>;

type QueryInput<Args> = HasOptionalArgs<Args> extends true ? { input?: Args | SkipToken } : { input: Args | SkipToken };

// `U` passing through is what preserves `initialData` narrowing: a given
// `initialData` stays required, which is all the defined-data overload keys on.
type QueryOptionsOut<U, TQueryFnData, TError> = Omit<NoInfer<U>, 'input'> & {
    queryKey: DataTag<KizunaQueryKey, TQueryFnData, TError>;
    queryFn: U extends { input: SkipToken } ? SkipToken : (context: QueryFunctionContext<KizunaQueryKey>) => Promise<TQueryFnData>;
};

type QueryOptionsFn<Args, Result> = <U extends QueryInput<Args> & QueryExtras<Result, DefaultError>>(
    options: U
) => QueryOptionsOut<U, Result, DefaultError>;

type InfiniteExtras<TQueryFnData, TError, TPageParam> = Omit<
    InfiniteQueryObserverOptions<TQueryFnData, TError, unknown, KizunaQueryKey, TPageParam>,
    'queryKey' | 'queryFn'
>;

type InfiniteOptionsOut<U, TQueryFnData, TError, TPageParam, Skipped extends boolean> = Omit<NoInfer<U>, 'input'> & {
    queryKey: DataTag<KizunaQueryKey, InfiniteData<TQueryFnData, TPageParam>, TError>;
    queryFn: Skipped extends true ? SkipToken : (context: QueryFunctionContext<KizunaQueryKey, TPageParam>) => Promise<TQueryFnData>;
};

// `input` sits outside `U`, and skipToken gets its own signature, because
// `TPageParam` only infers from a real parameter position.
interface InfiniteOptionsFn<Args, Result> {
    <TPageParam, U extends InfiniteExtras<Result, DefaultError, TPageParam>>(
        options: { input: (pageParam: TPageParam) => Args } & U
    ): InfiniteOptionsOut<U, Result, DefaultError, TPageParam, false>;
    <TPageParam, U extends InfiniteExtras<Result, DefaultError, TPageParam>>(
        options: { input: SkipToken } & U
    ): InfiniteOptionsOut<U, Result, DefaultError, TPageParam, true>;
}

type KeyFn<Args> = (options?: { input?: Args }) => KizunaQueryKey;

/**
 * A route whose method is `GET` or `HEAD`.
 */
export interface QueryProcedure<Args, Result> {
    /**
     * Options for `useQuery`. `data` is the route's declared response union; an
     * undeclared status throws.
     */
    queryOptions: QueryOptionsFn<Args, Result>;
    /**
     * Options for `useInfiniteQuery`. `input` is a function of the page parameter.
     */
    infiniteOptions: InfiniteOptionsFn<Args, Result>;
    /**
     * The query's full key.
     */
    queryKey: KeyFn<Args>;
    /**
     * The infinite query's full key.
     */
    infiniteKey: KeyFn<Args>;
    /**
     * The partial key matching every operation on this route.
     */
    key: () => KizunaPathKey;
    /**
     * Calls the route, bypassing the cache.
     */
    call: CallFn<Args, Result>;
}

type MutationVariables<Args> = HasOptionalArgs<Args> extends true ? void : Args;

type MutationExtras<Args, Result, TError> = Omit<
    MutationObserverOptions<Result, TError, MutationVariables<Args>>,
    'mutationKey' | 'mutationFn'
>;

type MutationOptionsFn<Args, Result> = <U extends MutationExtras<Args, Result, DefaultError> = MutationExtras<Args, Result, DefaultError>>(
    options?: U
) => NoInfer<U> & {
    mutationKey: KizunaPathKey;
    mutationFn: (variables: MutationVariables<Args>) => Promise<Result>;
};

/**
 * A route whose method is anything other than `GET` or `HEAD`.
 */
export interface MutationProcedure<Args, Result> {
    /**
     * Options for `useMutation`. `mutate` takes the route's call arguments, or
     * nothing when every argument is optional.
     */
    mutationOptions: MutationOptionsFn<Args, Result>;
    /**
     * The mutation's full key.
     */
    mutationKey: () => KizunaPathKey;
    /**
     * The partial key matching this route.
     */
    key: () => KizunaPathKey;
    /**
     * Calls the route, outside a mutation.
     */
    call: CallFn<Args, Result>;
}

/**
 * Carried by the root and every group, for invalidating a whole group at once.
 */
export interface PathProcedures {
    key: () => KizunaPathKey;
}

/**
 * The messages a streamed result yields, read off the `AsyncIterable` body the
 * client hands back rather than off the route's declaration.
 */
type StreamMessageOfResult<Result> = Result extends { body: AsyncIterable<infer Message> } ? Message : never;

type StreamExtras<TData, TError> = Omit<QueryObserverOptions<TData, TError, unknown, TData, KizunaQueryKey>, 'queryKey' | 'queryFn'> & {
    /**
     * What a refetch does with the messages already held: `'reset'` clears them
     * first, `'append'` adds to them, `'replace'` swaps them in once the stream ends.
     *
     * @default 'reset'
     */
    refetchMode?: 'append' | 'reset' | 'replace';
};

type StreamOptionsOut<U, TData, TError> = Omit<NoInfer<U>, 'input' | 'refetchMode'> & {
    queryKey: DataTag<KizunaQueryKey, TData, TError>;
    queryFn: U extends { input: SkipToken } ? SkipToken : QueryFunction<TData, KizunaQueryKey>;
};

type StreamOptionsFn<Args, Result> = <U extends QueryInput<Args> & StreamExtras<StreamMessageOfResult<Result>[], DefaultError>>(
    options: U
) => StreamOptionsOut<U, StreamMessageOfResult<Result>[], DefaultError>;

/**
 * A route whose response streams. `data` is the list of messages received so
 * far, growing as they arrive.
 */
export interface StreamProcedure<Args, Result> {
    /**
     * Options for `useQuery`, over TanStack's `streamedQuery`. A status other than
     * the streamed one throws `NonStreamResponseError`.
     */
    streamOptions: StreamOptionsFn<Args, Result>;
    /**
     * The stream query's full key.
     */
    streamKey: KeyFn<Args>;
    key: () => KizunaPathKey;
    call: CallFn<Args, Result>;
}

type HasStream<R extends RouteDefinition> = {
    [Status in keyof R['responses']]: R['responses'][Status] extends StreamResponseDefinition ? true : never;
}[keyof R['responses']] extends never
    ? false
    : true;

/**
 * Which factories a route gets: a streamed response takes `streamOptions`, a
 * `GET` or `HEAD` takes the query factories, and everything else mutates.
 */
type ProcedureFor<Method, Streams, Args, Result> = Streams extends true
    ? StreamProcedure<Args, Result>
    : Method extends 'GET' | 'HEAD'
      ? QueryProcedure<Args, Result>
      : MutationProcedure<Args, Result>;

type Procedure<R extends RouteDefinition, Codes extends string> = ProcedureFor<
    R['method'],
    HasStream<R>,
    ClientArgs<R>,
    ClientResponse<R, Codes>
>;

/**
 * The route tree, each route carrying its query or mutation factories.
 */
export type KizunaQueryProxy<T extends Routes, Codes extends string = never> = {
    [K in keyof T as K extends string ? K : never]: T[K] extends RouteDefinition
        ? Procedure<T[K], Codes>
        : T[K] extends Routes
          ? KizunaQueryProxy<T[K], Codes> & PathProcedures
          : never;
};

/**
 * The same tree, read off a generated client instead of off the routes. Each of
 * its methods carries the method it calls and whether that response streams, so
 * the client alone says which factories every route gets.
 */
export type GeneratedQueryProxy<C> = {
    [K in keyof C as K extends string ? K : never]: C[K] extends ClientMethod<infer Method, infer Streams, infer Args, infer Result>
        ? ProcedureFor<Method, Streams, Args, Result>
        : C[K] extends object
          ? GeneratedQueryProxy<C[K]> & PathProcedures
          : never;
};

export interface KizunaTanstackQueryConstructor {
    /**
     * The client is the only argument: each of its methods carries the route it
     * answers, so nothing has to hand over the api a second time.
     */
    new <T extends Routes, Codes extends string = never>(client: Client<T, Codes>): KizunaQueryProxy<T, Codes> & PathProcedures;
    new <C extends object>(client: C): GeneratedQueryProxy<C> & PathProcedures;
}
