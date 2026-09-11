import type { z } from 'zod';
import {
    createGenerator,
    parsePath,
    resolveResponseBody,
    resolveResponseHeaders,
    isObjectSchema,
    isDiscriminatedUnionSchema,
    readMetaId,
    toPascalCase,
    shortTypeName,
    isHintPrefix,
    localTypeName,
    statusToCamelCase,
    isSuccessStatus,
    mergeHeaderFields,
    type RouteDefinition,
    isStreamResponse,
    isNamedStream,
    streamMode,
    routeStreams,
    soleStreamResponse,
} from '@ts-kizuna/core/generator';
import type { Contract } from '@ts-kizuna/core';
import { KotlinWriter, stringLiteral } from './emit.js';
import {
    TypeRegistry,
    mapType,
    collectObjectFields,
    objectFieldCount,
    objectShapeKeys,
    type KotlinField,
    type KotlinType,
} from './zod-to-kotlin.js';

export interface KotlinConfig {
    namespaceName: string;
    /**
     * Package declaration for the generated file (e.g. `com.example.api`).
     *
     * Omit to emit the file with no package (the default/root package).
     */
    packageName?: string;
    /**
     * Convert wire field names to camelCase properties, mapping the wire name
     * back via `@SerialName`. When off, names are kept verbatim so the generated
     * types mirror the wire shape.
     *
     * @default false
     */
    camelCaseProperties?: boolean;
    /**
     * Emit each `z.enum` as a `sealed interface` with an `Unknown(wireValue)`
     * member, so unrecognised wire values decode instead of throwing. The raw
     * string round-trips on encode and in query params. Discriminated unions are
     * unaffected and still throw on an unknown discriminator.
     *
     * @default false
     */
    unknownEnumCase?: boolean;
}

const BODY_FLATTEN_MAX_FIELDS = 6;

// OkHttp's `Request.Builder.method` throws for these methods when the body is null.
const METHODS_REQUIRING_BODY = new Set(['POST', 'PUT', 'PATCH']);

interface BodyDescriptor {
    kind: 'json-flat' | 'json-struct' | 'multipart' | 'union' | 'json-empty';
    structName?: string;
    flattened: KotlinField[];
    multipartFields: Array<{ name: string; wireName: string; isFile: boolean }>;
}

interface RouteMethod {
    name: string;
    operationName: string;
    summary?: string;
    description?: string;
    deprecated: boolean;
    deprecationMessage?: string;
    pathParams: string[];
    declaredPathParams: KotlinField[];
    pathTemplate: string;
    method: string;
    body?: BodyDescriptor;
    query: KotlinField[];
    headers: KotlinField[];
    resultHeaderFields: KotlinField[];
    resultWrapperName?: string;
    successResponses: Array<{
        status: number;
        type: string;
        responseHeaders: KotlinField[];
    }>;
    successReturnType: string;
    successSumClassName?: string;
    failureClassName: string;
    errorCases: Array<{
        caseName: string;
        status: number;
        type: string;
    }>;
    stream?: StreamDescriptor;
}

interface StreamDescriptor {
    status: number;
    mode: 'events' | 'text' | 'binary';
    events?: Array<{ name: string; caseName: string; type: string }>;
    messageType?: string;
}

interface RouteGroup {
    groupKey: string;
    className: string;
    propertyName: string;
    methods: RouteMethod[];
}

interface ContractPartition {
    flatMethods: RouteMethod[];
    groups: RouteGroup[];
}

interface EmitContext {
    namespaceName: string;
    clientName: string;
    operationTypeMap: Map<string, string>;
    fileLevelTypeNames: Set<string>;
    ownedTypeMap: Map<string, string>;
    // Header fields from the contract's request context declarations; empty when none.
    requestContextFields: KotlinField[];
}

const buildRouteMethod = (
    routeKey: string,
    route: RouteDefinition,
    registry: TypeRegistry,
    deprecated: boolean,
    deprecationMessage: string | undefined,
    methodNameOverride?: string
): RouteMethod => {
    const fullJoinedName = routeKey.includes('.')
        ? routeKey
              .split('.')
              .map((segment, index) => (index === 0 ? segment : toPascalCase(segment)))
              .join('')
        : routeKey;
    const methodName = methodNameOverride ?? fullJoinedName;
    const baseHint = toPascalCase(fullJoinedName);
    const pathParams = parsePath(route.path).paramNames;

    const declaredPathParams: KotlinField[] = route.pathParams
        ? collectObjectFields(route.pathParams as z.ZodType, registry, `${baseHint}Params`)
        : [];

    const queryFields: KotlinField[] = route.query ? collectObjectFields(route.query as z.ZodType, registry, `${baseHint}Query`) : [];

    const headerFields: KotlinField[] = route.headers
        ? collectObjectFields(route.headers as z.ZodType, registry, `${baseHint}Headers`)
        : [];

    const bodyDefType =
        (route.body as unknown as { _def?: { type?: string }; def?: { type?: string } } | undefined)?._def?.type ??
        (route.body as unknown as { _def?: { type?: string }; def?: { type?: string } } | undefined)?.def?.type;
    let bodyDescriptor: BodyDescriptor | undefined;
    if (route.body && bodyDefType !== 'void') {
        const bodyHint = readMetaId(route.body as never) ?? `${baseHint}Input`;
        const isMultipart = route.contentType === 'multipart/form-data';
        const isUnion = isDiscriminatedUnionSchema(route.body as z.ZodType);

        if (isUnion) {
            const result = mapType(route.body as z.ZodType, registry, bodyHint);
            bodyDescriptor = {
                kind: 'union',
                structName: result.expression,
                flattened: [],
                multipartFields: [],
            };
        } else if (isMultipart) {
            mapType(route.body as z.ZodType, registry, bodyHint);
            const flattened = collectObjectFields(route.body as z.ZodType, registry, bodyHint);
            const multipartFields = objectShapeKeys(route.body as z.ZodType, registry.camelCaseProperties);
            bodyDescriptor = {
                kind: 'multipart',
                flattened,
                multipartFields,
            };
        } else {
            const isObject = isObjectSchema(route.body as z.ZodType);
            const fieldCount = isObject ? objectFieldCount(route.body as z.ZodType) : 0;

            if (isObject && fieldCount === 0) {
                bodyDescriptor = {
                    kind: 'json-empty',
                    flattened: [],
                    multipartFields: [],
                };
            } else {
                const useStruct = !isObject || fieldCount > BODY_FLATTEN_MAX_FIELDS;
                const result = mapType(route.body as z.ZodType, registry, bodyHint);
                const structName = result.expression;

                if (useStruct) {
                    bodyDescriptor = {
                        kind: 'json-struct',
                        structName,
                        flattened: [],
                        multipartFields: [],
                    };
                } else {
                    const flattened = collectObjectFields(route.body as z.ZodType, registry, bodyHint);
                    bodyDescriptor = {
                        kind: 'json-flat',
                        structName,
                        flattened,
                        multipartFields: [],
                    };
                }
            }
        }
    }

    const successResponses: RouteMethod['successResponses'] = [];
    const errorCases: RouteMethod['errorCases'] = [];

    let stream: StreamDescriptor | undefined;
    for (const [statusKey, responseValue] of Object.entries(route.responses)) {
        const status = Number(statusKey);
        const responseHint = `${baseHint}Response${status === 200 ? '' : status}`;
        if (isStreamResponse(responseValue)) {
            const mode = streamMode(responseValue);
            if (mode === 'events' && isNamedStream(responseValue.stream)) {
                stream = {
                    status,
                    mode,
                    events: Object.entries(responseValue.stream).map(([name, schema]) => ({
                        name,
                        caseName: toPascalCase(name),
                        type: mapType(schema, registry, `${baseHint}${toPascalCase(name)}`).expression,
                    })),
                };
            } else if (mode === 'events') {
                stream = {
                    status,
                    mode,
                    messageType: mapType(responseValue.stream as z.ZodType, registry, `${baseHint}Message`).expression,
                };
            } else {
                stream = {
                    status,
                    mode,
                };
            }
            const headersSchema = resolveResponseHeaders(responseValue);
            successResponses.push({
                status,
                type: stream.messageType ?? 'Event',
                responseHeaders: headersSchema
                    ? collectObjectFields(headersSchema as z.ZodType, registry, `${baseHint}ResponseHeaders`)
                    : [],
            });
            continue;
        }
        const bodySchema = resolveResponseBody(responseValue)!;
        const result = mapType(bodySchema as z.ZodType, registry, responseHint);
        const typeExpression = result.expression;
        if (isSuccessStatus(status)) {
            const headersSchema = resolveResponseHeaders(responseValue);
            const perStatusHeaderFields: KotlinField[] = headersSchema
                ? collectObjectFields(headersSchema as z.ZodType, registry, `${baseHint}ResponseHeaders`)
                : [];
            successResponses.push({
                status,
                type: typeExpression,
                responseHeaders: perStatusHeaderFields,
            });
        } else {
            errorCases.push({
                caseName: statusToCamelCase(status),
                status,
                type: typeExpression,
            });
        }
    }
    const hasValidation = route.body || route.query;
    if (hasValidation) {
        const has400 = errorCases.some((candidate) => candidate.status === 400);
        errorCases.push({
            caseName: has400 ? 'validationError' : statusToCamelCase(400),
            status: 400,
            type: 'ValidationError',
        });
    }

    successResponses.sort((left, right) => left.status - right.status);

    const resultHeaderFields: KotlinField[] = mergeHeaderFields(successResponses.map((entry) => entry.responseHeaders));

    let successReturnType = 'Unit';
    let successSumClassName: string | undefined;
    if (route.method !== 'HEAD') {
        const onlySuccess = successResponses[0];
        if (successResponses.length === 1 && onlySuccess) {
            successReturnType = onlySuccess.type;
        } else if (successResponses.length > 1) {
            successSumClassName = 'Success';
            successReturnType = successSumClassName;
        }
    }

    const resultWrapperName = successReturnType !== 'Unit' ? 'Result' : undefined;

    return {
        name: methodName,
        operationName: baseHint,
        summary: route.summary,
        description: route.description,
        deprecated,
        deprecationMessage,
        pathParams,
        declaredPathParams,
        pathTemplate: route.path,
        method: route.method,
        body: bodyDescriptor,
        query: queryFields,
        headers: headerFields,
        resultHeaderFields,
        resultWrapperName,
        successResponses,
        successReturnType,
        successSumClassName,
        failureClassName: 'Failure',
        errorCases,
        stream,
    };
};

const kotlinGenerator = createGenerator((options: KotlinConfig & { registry: TypeRegistry }, contract: Contract) => {
    const flatMethods: RouteMethod[] = [];
    const groupMap = new Map<string, RouteMethod[]>();

    return {
        processRoute({ routeKey, route, deprecated, deprecationMessage }) {
            if (routeStreams(route) && soleStreamResponse(route) === undefined) {
                console.warn(
                    `[ts-kizuna/kotlin] Skipping route "${routeKey}": a streamed status beside another 2xx status is not generated.`
                );
                return;
            }
            const dotIndex = routeKey.indexOf('.');
            if (dotIndex !== -1) {
                const groupKey = routeKey.slice(0, dotIndex);
                const remainder = routeKey.slice(dotIndex + 1);
                const leafName = remainder
                    .split('.')
                    .map((segment: string, index: number) => (index === 0 ? segment : toPascalCase(segment)))
                    .join('');
                const methods = groupMap.get(groupKey) ?? [];
                if (methods.length === 0) groupMap.set(groupKey, methods);
                methods.push(buildRouteMethod(routeKey, route, options.registry, deprecated, deprecationMessage, leafName));
            } else {
                flatMethods.push(buildRouteMethod(routeKey, route, options.registry, deprecated, deprecationMessage));
            }
        },

        finalize(): ContractPartition {
            const groups: RouteGroup[] = [];
            for (const [groupKey, methods] of groupMap) {
                groups.push({
                    groupKey,
                    className: `${options.namespaceName}${toPascalCase(groupKey)}Client`,
                    propertyName: groupKey,
                    methods,
                });
            }
            return { flatMethods, groups };
        },
    };
});

const KOTLIN_KEYWORDS = new Set([
    'as',
    'break',
    'class',
    'continue',
    'do',
    'else',
    'false',
    'for',
    'fun',
    'if',
    'in',
    'interface',
    'is',
    'null',
    'object',
    'package',
    'return',
    'super',
    'this',
    'throw',
    'true',
    'try',
    'typealias',
    'typeof',
    'val',
    'var',
    'when',
    'while',
]);

const escapeKeyword = (name: string): string => {
    return KOTLIN_KEYWORDS.has(name) ? `\`${name}\`` : name;
};

const optionalize = (type: string, optional: boolean): string => {
    if (!optional) return type;
    return type.endsWith('?') ? type : `${type}?`;
};

const KOTLIN_PRIMITIVE_TYPES = new Set(['String', 'Int', 'Double', 'Long', 'Boolean', 'Instant', 'Unit']);

const resolveType = (
    typeName: string,
    currentOperation: string | undefined,
    context: EmitContext,
    scope: 'operation-object' | 'client' = 'client'
): string => {
    const { operationTypeMap, namespaceName, clientName, fileLevelTypeNames } = context;
    const optional = typeName.endsWith('?');
    const base = optional ? typeName.slice(0, -1) : typeName;

    if (KOTLIN_PRIMITIVE_TYPES.has(base)) return typeName;

    if (base.startsWith('List<') && base.endsWith('>')) {
        const inner = base.slice(5, -1);
        const resolved = resolveType(inner, currentOperation, context, scope);
        return optional ? `List<${resolved}>?` : `List<${resolved}>`;
    }

    if (base.startsWith('Map<String, ') && base.endsWith('>')) {
        const inner = base.slice(12, -1);
        const resolved = resolveType(inner, currentOperation, context, scope);
        return optional ? `Map<String, ${resolved}>?` : `Map<String, ${resolved}>`;
    }

    if (base === 'MultipartFile' || base === 'ValidationError' || base === 'ValidationIssue') {
        const qualified = `${clientName}.${base}`;
        return optional ? `${qualified}?` : qualified;
    }

    if (base === 'JsonElement') {
        return optional ? `JsonElement?` : `JsonElement`;
    }

    if (fileLevelTypeNames.has(base)) {
        return optional ? `${base}?` : base;
    }

    const owningStruct = context.ownedTypeMap.get(base);
    if (owningStruct !== undefined) {
        const short = shortTypeName(base, owningStruct);
        const ownerResolved = resolveType(owningStruct, currentOperation, context, scope).replace(/\?$/, '');
        return optional ? `${ownerResolved}.${short}?` : `${ownerResolved}.${short}`;
    }

    const owningOp = operationTypeMap.get(base);
    if (owningOp === undefined) {
        return optional ? `${namespaceName}.${base}?` : `${namespaceName}.${base}`;
    }
    const short = localTypeName(base, owningOp);
    if (owningOp === currentOperation && scope === 'operation-object') {
        return optional ? `${short}?` : short;
    }
    return optional ? `${clientName}.${owningOp}.${short}?` : `${clientName}.${owningOp}.${short}`;
};

const buildOperationTypeMap = (allMethods: RouteMethod[], registry: TypeRegistry): Map<string, string> => {
    const operationNames = new Set(allMethods.map((method) => method.operationName));
    const operationTypeMap = new Map<string, string>();
    for (const type of registry.all()) {
        let bestMatch: string | undefined;
        for (const operationName of operationNames) {
            if (isHintPrefix(type.name, operationName)) {
                if (!bestMatch || operationName.length > bestMatch.length) {
                    bestMatch = operationName;
                }
            }
        }
        if (bestMatch !== undefined) {
            operationTypeMap.set(type.name, bestMatch);
        }
    }
    return operationTypeMap;
};

const localizeType = (type: KotlinType, operationName: string, context: EmitContext): KotlinType => {
    const shortName = localTypeName(type.name, operationName);
    if (type.kind === 'data-class') {
        return {
            ...type,
            name: shortName,
            fields: type.fields.map((field) => ({
                ...field,
                type: resolveType(field.type, operationName, context, 'operation-object'),
            })),
        };
    }
    if (type.kind === 'enum-class') {
        return { ...type, name: shortName };
    }
    return {
        ...type,
        name: shortName,
        variants: type.variants.map((variant) => ({
            ...variant,
            payloadType: resolveType(variant.payloadType, operationName, context, 'operation-object'),
        })),
    };
};

const deprecatedAnnotation = (message: string | undefined): string => {
    if (message === undefined || message === '') return '@Deprecated("Deprecated")';
    return `@Deprecated(${stringLiteral(message)})`;
};

/**
 * Converts an enum value into a valid Kotlin enum constant name.
 *
 * Uppercases and snake-cases the value, prefixing `_` when it starts with a
 * digit (Kotlin identifiers cannot begin with one). The original value is
 * preserved separately as the `@SerialName` wire value.
 */
const enumConstantName = (value: string): string => {
    const upper = value.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    return /^[0-9]/.test(upper) ? `_${upper}` : upper;
};

const emitEnumClass = (writer: KotlinWriter, name: string, cases: string[], unknownCase: boolean, description?: string): void => {
    writer.blank();
    writer.docComment(description);
    if (!unknownCase) {
        writer.line('@Serializable');
        // `wireValue` carries the `@SerialName` for query/header serialization (see `stringifyQueryValue`).
        writer.block(`enum class ${name}(override val wireValue: String) : KizunaQueryValue`, () => {
            for (let index = 0; index < cases.length; index += 1) {
                const caseName = cases[index]!;
                const enumConstant = enumConstantName(caseName);
                const separator = index < cases.length - 1 ? ',' : '';
                writer.line(`@SerialName(${stringLiteral(caseName)}) ${enumConstant}(${stringLiteral(caseName)})${separator}`);
            }
        });
        return;
    }
    writer.line(`@Serializable(with = ${name}.Serializer::class)`);
    writer.block(`sealed interface ${name} : KizunaQueryValue`, () => {
        for (const caseName of cases) {
            writer.block(`data object ${enumConstantName(caseName)} : ${name}`, () => {
                writer.line(`override val wireValue: String = ${stringLiteral(caseName)}`);
            });
        }
        writer.line(`data class Unknown(override val wireValue: String) : ${name}`);
        writer.blank();
        writer.block('companion object', () => {
            writer.block(`fun fromWireValue(wireValue: String): ${name} = when (wireValue)`, () => {
                for (const caseName of cases) {
                    writer.line(`${stringLiteral(caseName)} -> ${enumConstantName(caseName)}`);
                }
                writer.line('else -> Unknown(wireValue)');
            });
        });
        writer.blank();
        writer.block(`object Serializer : KSerializer<${name}>`, () => {
            writer.line(
                `override val descriptor: SerialDescriptor = PrimitiveSerialDescriptor(${stringLiteral(name)}, PrimitiveKind.STRING)`
            );
            writer.line(`override fun deserialize(decoder: Decoder): ${name} = ${name}.fromWireValue(decoder.decodeString())`);
            writer.block(`override fun serialize(encoder: Encoder, value: ${name})`, () => {
                writer.line('encoder.encodeString(value.wireValue)');
            });
        });
    });
};

const emitDataClass = (
    writer: KotlinWriter,
    type: Extract<KotlinType, { kind: 'data-class' }>,
    ownedTypeMap: Map<string, string>,
    ownedTypeLookup: Map<string, KotlinType>,
    registryName?: string
): void => {
    const lookupName = registryName ?? type.name;
    const baseFields = type.discriminatorWireName
        ? type.fields.filter((field) => field.wireName !== type.discriminatorWireName)
        : type.fields;
    const hasFile = baseFields.some((field) => field.isFile);

    const resolveOwnedType = (raw: string): string => {
        const optional = raw.endsWith('?');
        const stripped = optional ? raw.slice(0, -1) : raw;
        const isList = stripped.startsWith('List<') && stripped.endsWith('>');
        const inner = isList ? stripped.slice(5, -1) : stripped;
        if (ownedTypeMap.get(inner) !== lookupName) return raw;
        const short = shortTypeName(inner, lookupName);
        const resolved = isList ? `List<${short}>` : short;
        return optional ? `${resolved}?` : resolved;
    };

    const adjustedFields = baseFields.map((field) => ({
        ...field,
        type: resolveOwnedType(field.type),
    }));

    const needsSerialName = !hasFile && baseFields.some((field) => field.name !== field.wireName || KOTLIN_KEYWORDS.has(field.name));

    if (type.serialName !== undefined) {
        writer.line(`@SerialName(${stringLiteral(type.serialName)})`);
    }
    if (!hasFile) {
        writer.line('@Serializable');
    }

    const params = adjustedFields.map((field) => {
        const typeExpression = optionalize(field.type, field.optional);
        const defaultPart = field.optional ? ' = null' : '';
        const serialNameAnnotation =
            needsSerialName && (field.name !== field.wireName || KOTLIN_KEYWORDS.has(field.name))
                ? `@SerialName(${stringLiteral(field.wireName)}) `
                : '';
        const deprecatedPart = field.deprecated ? `${deprecatedAnnotation(field.deprecationMessage)} ` : '';
        return `${deprecatedPart}${serialNameAnnotation}val ${escapeKeyword(field.name)}: ${typeExpression}${defaultPart}`;
    });

    const hasOwnedTypes = Array.from(ownedTypeMap.entries()).some(([, owner]) => owner === lookupName);

    if (params.length === 0) {
        writer.line(`data class ${type.name}(private val unused: Unit = Unit)`);
    } else if (params.length === 1) {
        writer.line(`data class ${type.name}(${params[0]})`);
    } else {
        writer.line(`data class ${type.name}(`);
        writer.indent(() => {
            for (let index = 0; index < params.length; index += 1) {
                const separator = index < params.length - 1 ? ',' : '';
                writer.line(`${params[index]}${separator}`);
            }
        });
        writer.line(')');
    }

    if (type.sealedParent !== undefined) {
        writer.appendToLastLine(` : ${type.sealedParent}`);
    }

    if (hasOwnedTypes) {
        writer.appendToLastLine(' {');
        writer.indent(() => {
            emitOwnedTypes(writer, lookupName, ownedTypeMap, ownedTypeLookup);
        });
        writer.line('}');
    }
};

const emitOwnedTypes = (
    writer: KotlinWriter,
    ownerName: string,
    ownedTypeMap: Map<string, string>,
    ownedTypeLookup: Map<string, KotlinType>,
    registry?: TypeRegistry
): void => {
    for (const [ownedName, owningType] of ownedTypeMap) {
        if (owningType !== ownerName) continue;
        const ownedType = ownedTypeLookup.get(ownedName);
        if (!ownedType) continue;
        const shortName = shortTypeName(ownedName, ownerName);
        emitType(writer, { ...ownedType, name: shortName }, ownedTypeMap, ownedTypeLookup, ownedName, registry);
    }
};

// Inside `enclosingPath`, a type it owns is already in scope: `Reason`, not
// `UserSessionEvent.Logout.Reason`. Undefined when the type is owned by something else.
const relativeOwnedPath = (
    typeName: string,
    ownedTypeMap: Map<string, string>,
    enclosingPath: string,
    registry?: TypeRegistry
): string | undefined => {
    const path = ownedTypePath(typeName, ownedTypeMap, registry);
    const prefix = `${enclosingPath}.`;
    return path.startsWith(prefix) ? path.slice(prefix.length) : undefined;
};

const ownedTypePath = (typeName: string, ownedTypeMap: Map<string, string>, registry?: TypeRegistry): string => {
    const sealedPath = registry?.sealedVariantPath(typeName);
    if (sealedPath !== undefined) return sealedPath;
    const owningClass = ownedTypeMap.get(typeName);
    if (owningClass === undefined) return typeName;
    return `${ownedTypePath(owningClass, ownedTypeMap, registry)}.${shortTypeName(typeName, owningClass)}`;
};

const emitSealedClass = (
    writer: KotlinWriter,
    type: Extract<KotlinType, { kind: 'sealed-class' }>,
    registry: TypeRegistry,
    ownedTypeMap: Map<string, string>,
    ownedTypeLookup: Map<string, KotlinType>
): void => {
    writer.line(`@OptIn(ExperimentalSerializationApi::class)`);
    writer.line(`@JsonClassDiscriminator(${stringLiteral(type.discriminator)})`);
    writer.line('@Serializable');

    const nestedVariants = type.variants.filter((variant) => variant.nested);
    if (nestedVariants.length === 0) {
        writer.line(`sealed interface ${type.name}`);
        return;
    }

    // Fields every variant carries, reachable without a `when` first. The discriminator is
    // always one of them, so `call.name` reads straight off the interface.
    // The registry prefixes a payload with its operation, e.g. `AssistantReplyToolCallCountWords`,
    // while the variant carries the short name the emitted class uses.
    const payloadFor = (payloadName: string): Extract<KotlinType, { kind: 'data-class' }> | undefined => {
        const found =
            registry.all().find((candidate) => candidate.name === payloadName) ??
            registry.all().find((candidate) => candidate.name.endsWith(payloadName));
        return found && found.kind === 'data-class' ? found : undefined;
    };
    const wrapped = nestedVariants.map((variant) => ({
        variant,
        payload: payloadFor(variant.payloadType),
        inlined: (() => {
            const candidate = registry.all().find((entry) => entry.name === variant.payloadType);
            return !!candidate && candidate.kind === 'data-class' && candidate.fields.length > 0;
        })(),
    }));
    const sharedFields =
        wrapped.length > 0 && wrapped.every(({ payload, inlined }) => payload !== undefined && !inlined)
            ? wrapped[0]!.payload!.fields.filter((field) =>
                  wrapped.every(({ payload }) =>
                      payload!.fields.some(
                          (other) => other.name === field.name && other.type === field.type && other.optional === field.optional
                      )
                  )
              )
            : [];

    writer.block(`sealed interface ${type.name}`, () => {
        for (const field of sharedFields) {
            const typeExpression = optionalize(ownedTypePath(field.type, ownedTypeMap, registry), field.optional);
            writer.line(`val ${escapeKeyword(field.name)}: ${typeExpression}`);
        }
        if (sharedFields.length > 0) writer.blank();

        for (const variant of nestedVariants) {
            const payloadType = registry.all().find((candidate) => candidate.name === variant.payloadType);
            writer.line(`@SerialName(${stringLiteral(variant.literal)})`);
            writer.line('@Serializable');
            const ownsNestedTypes = Array.from(ownedTypeMap.values()).includes(variant.payloadType);
            const emitVariantBody = (): void => {
                emitOwnedTypes(writer, variant.payloadType, ownedTypeMap, ownedTypeLookup, registry);
            };
            if (payloadType && payloadType.kind === 'data-class' && payloadType.fields.length > 0) {
                const fields = payloadType.fields.filter((field) => field.wireName !== type.discriminator);
                if (fields.length === 0) {
                    writer.line(`data object ${variant.caseName} : ${type.name}`);
                } else {
                    const params = fields.map((field) => {
                        const variantPath = registry.sealedVariantPath(variant.payloadType) ?? variant.payloadType;
                        const relative = relativeOwnedPath(field.type, ownedTypeMap, variantPath, registry);
                        const typeExpression = optionalize(relative ?? ownedTypePath(field.type, ownedTypeMap, registry), field.optional);
                        const defaultPart = field.optional ? ' = null' : '';
                        return `val ${escapeKeyword(field.name)}: ${typeExpression}${defaultPart}`;
                    });
                    if (params.length === 1) {
                        writer.line(`data class ${variant.caseName}(${params[0]}) : ${type.name}`);
                    } else {
                        writer.line(`data class ${variant.caseName}(`);
                        writer.indent(() => {
                            for (let index = 0; index < params.length; index += 1) {
                                const separator = index < params.length - 1 ? ',' : '';
                                writer.line(`${params[index]}${separator}`);
                            }
                        });
                        writer.line(`) : ${type.name}`);
                    }
                    if (ownsNestedTypes) {
                        writer.appendToLastLine(' {');
                        writer.indent(emitVariantBody);
                        writer.line('}');
                    }
                }
            } else if (sharedFields.length > 0) {
                writer.block(
                    `data class ${variant.caseName}(val value: ${ownedTypePath(variant.payloadType, ownedTypeMap, registry)}) : ${type.name}`,
                    () => {
                        for (const field of sharedFields) {
                            const typeExpression = optionalize(ownedTypePath(field.type, ownedTypeMap, registry), field.optional);
                            writer.line(
                                `override val ${escapeKeyword(field.name)}: ${typeExpression} get() = value.${escapeKeyword(field.name)}`
                            );
                        }
                    }
                );
            } else {
                writer.line(
                    `data class ${variant.caseName}(val value: ${ownedTypePath(variant.payloadType, ownedTypeMap, registry)}) : ${type.name}`
                );
            }
        }
    });
};

const emitType = (
    writer: KotlinWriter,
    type: KotlinType,
    ownedTypeMap: Map<string, string> = new Map(),
    ownedTypeLookup: Map<string, KotlinType> = new Map(),
    registryName?: string,
    registry?: TypeRegistry
): void => {
    writer.blank();
    writer.docComment(type.description);
    if (type.kind === 'data-class') {
        emitDataClass(writer, type, ownedTypeMap, ownedTypeLookup, registryName);
    } else if (type.kind === 'enum-class') {
        emitEnumClass(writer, type.name, type.cases, type.unknownCase, type.description);
    } else if (registry) {
        emitSealedClass(writer, type, registry, ownedTypeMap, ownedTypeLookup);
    }
};

const emitTypes = (
    writer: KotlinWriter,
    types: KotlinType[],
    ownedTypeMap: Map<string, string> = new Map(),
    ownedTypeLookup: Map<string, KotlinType> = new Map(),
    registry?: TypeRegistry
): void => {
    for (const type of types) {
        emitType(writer, type, ownedTypeMap, ownedTypeLookup, undefined, registry);
    }
};

const emitConstructorClass = (writer: KotlinWriter, declaration: string, params: string[]): void => {
    if (params.length === 1) {
        writer.line(`${declaration}(${params[0]})`);
    } else {
        writer.line(`${declaration}(`);
        writer.indent(() => {
            for (let index = 0; index < params.length; index += 1) {
                const separator = index < params.length - 1 ? ',' : '';
                writer.line(`${params[index]}${separator}`);
            }
        });
        writer.line(')');
    }
};

// A `data class` compares `ByteArray` fields by reference; override with content-based equality.
const emitByteArrayEquality = (writer: KotlinWriter, typeName: string, fields: Array<{ name: string; isByteArray: boolean }>): void => {
    const equalsTerms = fields.map((field) => {
        const name = escapeKeyword(field.name);
        return field.isByteArray ? `${name}.contentEquals(other.${name})` : `${name} == other.${name}`;
    });
    writer.line(`override fun equals(other: Any?) = other is ${typeName} && ${equalsTerms.join(' && ')}`);
    const hashExpression = fields.reduce((accumulator, field, index) => {
        const name = escapeKeyword(field.name);
        const term = field.isByteArray ? `${name}.contentHashCode()` : `${name}.hashCode()`;
        if (index === 0) return term;
        // Parenthesize only a compound accumulator; `*` already binds tighter than `+`.
        return `31 * ${index === 1 ? accumulator : `(${accumulator})`} + ${term}`;
    }, '');
    writer.line(`override fun hashCode() = ${hashExpression}`);
};

const isVoidSuccessMethod = (method: RouteMethod): boolean => method.successReturnType === 'Unit';

/**
 * Emit the per-operation result types for the throw-on-error model:
 *
 *   - `Result`: returned on success, exposing `body`, or `stream` on a streamed route,
 *     plus `headers`. Omitted for void-success routes, which return `Unit`.
 *   - `Success`: a sealed sum of the success statuses, used as `Result.body` when a
 *     route has more than one success status.
 *   - `Failure`: a sealed `Exception` thrown for declared error statuses, decode
 *     failures, and any unexpected status.
 */
const emitOperationResultTypes = (writer: KotlinWriter, method: RouteMethod, context: EmitContext): void => {
    const hasHeaders = method.resultHeaderFields.length > 0;
    const isMultiSuccess = method.successResponses.length > 1;
    const isVoidSuccess = isVoidSuccessMethod(method);

    if (isMultiSuccess) {
        writer.blank();
        writer.block('sealed interface Success', () => {
            for (const successResponse of method.successResponses) {
                const resolved = resolveType(successResponse.type, method.operationName, context, 'operation-object');
                writer.line(`data class Status${successResponse.status}(val body: ${resolved}) : Success`);
            }
        });
    }

    const streamEvents = method.stream?.events;
    if (streamEvents) {
        const eventNames = new Set(streamEvents.map((event) => event.name));
        const tracksTools = eventNames.has('tool_call') && eventNames.has('tool_result');
        if (tracksTools) {
            writer.blank();
            writer.line('/** One tool call, with its result once it answered. */');
            writer.line('data class ToolCallRecord(');
            writer.indent(() => {
                writer.line('val id: String,');
                writer.line('val name: String,');
                writer.line('val state: State = State.Running,');
                writer.line('/** The call as it arrived, to read its input. */');
                writer.line('val call: ToolCall? = null,');
                writer.line('/** The result once it answered, to read its output. */');
                writer.line('val result: ToolResult? = null,');
                writer.line('/** What the tool reported when it failed. */');
                writer.line('val message: String? = null,');
            });
            writer.line(') {');
            writer.indent(() => {
                writer.line('/** How far along the call is. */');
                writer.line('enum class State { Running, Done, Failed }');
            });
            writer.line('}');

            writer.blank();
            writer.line("/** Fold a stream's events into one row per tool call, in the order the calls arrived. */");
            writer.block('fun readToolCalls(events: List<Event>): List<ToolCallRecord>', () => {
                writer.line('val calls = LinkedHashMap<String, ToolCallRecord>()');
                writer.block('for (event in events)', () => {
                    writer.line('when (event) {');
                    writer.indent(() => {
                        writer.line(
                            'is Event.ToolCall -> calls[event.data.id] = (calls[event.data.id] ?: ToolCallRecord(event.data.id, event.data.name)).copy(call = event.data)'
                        );
                        writer.line(
                            'is Event.ToolResult -> calls[event.data.id] = (calls[event.data.id] ?: ToolCallRecord(event.data.id, event.data.name)).copy(state = ToolCallRecord.State.Done, result = event.data)'
                        );
                        if (eventNames.has('tool_error')) {
                            writer.line(
                                'is Event.ToolError -> calls[event.data.id] = (calls[event.data.id] ?: ToolCallRecord(event.data.id, event.data.name.wireValue)).copy(state = ToolCallRecord.State.Failed, message = event.data.message)'
                            );
                        }
                        writer.line('else -> Unit');
                    });
                    writer.line('}');
                });
                writer.line('return calls.values.toList()');
            });
        }

        writer.blank();
        writer.block('sealed interface Event', () => {
            for (const event of streamEvents) {
                const payloadType = resolveType(event.type, method.operationName, context);
                writer.line(`data class ${event.caseName}(val data: ${payloadType}) : Event`);
            }
        });
    }

    if (!isVoidSuccess) {
        // A status sent piece by piece is a `stream`, matching the contract; one sent at once is a `body`.
        const valueName = method.stream ? 'stream' : 'body';
        const valueType = method.stream
            ? `Flow<${streamElementType(method, context, 'operation-object')}>`
            : isMultiSuccess
              ? 'Success'
              : resolveType(method.successReturnType, method.operationName, context, 'operation-object');
        writer.blank();
        const params = [`val ${valueName}: ${valueType}`];
        if (hasHeaders) params.push('val headers: Headers');
        emitConstructorClass(writer, 'data class Result', params);

        // Nested in `Result` so `Result.Headers` doesn't collide with the request `Headers` group.
        if (hasHeaders) {
            const headerParams = method.resultHeaderFields.map((field) => {
                const rawType = resolveType(field.type, method.operationName, context, 'operation-object');
                return `val ${escapeKeyword(field.name)}: ${optionalize(rawType, field.optional)}`;
            });
            writer.appendToLastLine(' {');
            writer.indent(() => {
                writer.blank();
                emitConstructorClass(writer, 'data class Headers', headerParams);
            });
            writer.line('}');
        }
    }

    writer.blank();
    writer.block('sealed class Failure(message: String? = null) : Exception(message)', () => {
        for (const errorCase of method.errorCases) {
            const caseName = toPascalCase(errorCase.caseName);
            if (errorCase.type === 'Unit') {
                writer.line(`data object ${caseName} : Failure()`);
            } else {
                const resolved = resolveType(errorCase.type, method.operationName, context, 'operation-object');
                writer.line(`data class ${caseName}(val body: ${resolved}) : Failure()`);
            }
        }
        writer.line('class Unexpected(val statusCode: Int, val data: ByteArray) : Failure("Unexpected status $statusCode")');
        writer.line('class Decoding(override val cause: Throwable, val statusCode: Int, val data: ByteArray) : Failure(cause.message)');
    });
};

const streamElementType = (method: RouteMethod, context: EmitContext, scope: 'operation-object' | 'client'): string => {
    const stream = method.stream!;
    if (stream.mode === 'text') return 'String';
    if (stream.mode === 'binary') return 'ByteArray';
    if (stream.events) return scope === 'operation-object' ? 'Event' : `${context.clientName}.${method.operationName}.Event`;
    return resolveType(stream.messageType!, method.operationName, context, scope);
};

const groupTypeRef = (operationName: string, className: string, context: EmitContext): string =>
    `${context.clientName}.${operationName}.${className}`;

const groupMemberAccessor = (groupLabel: string, field: { name: string; optional?: boolean }): string =>
    `${groupLabel}.${escapeKeyword(field.name)}`;

// Required fields are non-null constructor properties, so omitting them is a compile error.
const groupClassField = (field: KotlinField): string => {
    const typeExpression = optionalize(field.type, field.optional);
    const defaultPart = field.optional ? ' = null' : '';
    return `val ${escapeKeyword(field.name)}: ${typeExpression}${defaultPart}`;
};

const emitGroupClass = (
    writer: KotlinWriter,
    className: string,
    fields: KotlinField[],
    method: RouteMethod,
    context: EmitContext
): void => {
    const resolved = fields.map((field) => ({
        ...field,
        type: resolveType(field.type, method.operationName, context, 'operation-object'),
    }));
    writer.blank();
    emitConstructorClass(
        writer,
        `data class ${className}`,
        resolved.map((field) => groupClassField(field))
    );
};

// Object (`json-flat`) and `multipart` bodies expose their fields directly; `json-struct` / `union`
// bodies expose the payload value as `payload`.
const emitBodyGroupClass = (writer: KotlinWriter, method: RouteMethod, context: EmitContext): void => {
    const body = method.body;
    if (!body || body.kind === 'json-empty') return;
    const operationName = method.operationName;

    if (body.kind === 'json-struct' || body.kind === 'union') {
        const payloadType = resolveType(body.structName!, operationName, context, 'operation-object');
        writer.blank();
        emitConstructorClass(writer, 'data class Body', [`val payload: ${payloadType}`]);
        return;
    }

    const resolved = body.flattened.map((field) => ({
        ...field,
        type:
            field.type === 'MultipartFile'
                ? `${context.clientName}.MultipartFile`
                : resolveType(field.type, operationName, context, 'operation-object'),
    }));
    writer.blank();
    emitConstructorClass(
        writer,
        'data class Body',
        resolved.map((field) => groupClassField(field))
    );
};

const emitRequestGroupClasses = (writer: KotlinWriter, method: RouteMethod, context: EmitContext): void => {
    if (method.pathParams.length > 0) emitGroupClass(writer, 'Params', pathParamFields(method), method, context);
    if (method.query.length > 0) emitGroupClass(writer, 'Query', method.query, method, context);
    if (method.headers.length > 0) emitGroupClass(writer, 'Headers', method.headers, method, context);
    emitBodyGroupClass(writer, method, context);
    emitArgsScaffolding(writer, method, context);
};

const pathParamFields = (method: RouteMethod): KotlinField[] =>
    method.pathParams.map((name) => {
        const declared = method.declaredPathParams.find((field) => field.wireName === name);
        return declared ? { ...declared, optional: false } : { name, wireName: name, type: 'String', optional: false };
    });

// Whether the method carries a call-site body group. `json-empty` bodies send `{}` with no group.
const hasBodyGroup = (method: RouteMethod): boolean => method.body !== undefined && method.body.kind !== 'json-empty';

interface MethodChannel {
    varName: string;
    className: string;
    required: boolean;
    fields: KotlinField[];
}

// The request channels of a method in canonical order (`params, query, headers, body`). A channel is
// required when it has any required field (path params and bodies always do).
const methodChannels = (method: RouteMethod): MethodChannel[] => {
    const channels: MethodChannel[] = [];

    if (method.pathParams.length > 0) {
        channels.push({
            varName: 'params',
            className: 'Params',
            required: true,
            fields: pathParamFields(method),
        });
    }
    if (method.query.length > 0) {
        channels.push({
            varName: 'query',
            className: 'Query',
            required: method.query.some((field) => !field.optional),
            fields: method.query,
        });
    }
    if (method.headers.length > 0) {
        channels.push({
            varName: 'headers',
            className: 'Headers',
            required: method.headers.some((field) => !field.optional),
            fields: method.headers,
        });
    }
    if (hasBodyGroup(method)) {
        const body = method.body!;
        const fields: KotlinField[] =
            body.kind === 'json-struct' || body.kind === 'union'
                ? [
                      {
                          name: 'payload',
                          wireName: 'payload',
                          type: body.structName!,
                          optional: false,
                      },
                  ]
                : body.flattened;
        channels.push({
            varName: 'body',
            className: 'Body',
            required: true,
            fields,
        });
    }

    return channels;
};

const resolveChannelFieldType = (field: KotlinField, method: RouteMethod, context: EmitContext): string =>
    field.type === 'MultipartFile'
        ? `${context.clientName}.MultipartFile`
        : resolveType(field.type, method.operationName, context, 'operation-object');

/**
 * Emit the call-shape scaffolding for a method's request channels:
 *
 *   - `Args`: the sealed result of the request-builder lambda, holding one value per channel
 *     (nullable when the channel is all-optional).
 *   - `Scope`: the lambda receiver exposing a factory function per channel
 *     (`params(id = "1")`), so call sites need no type names and completion lists the channels.
 *   - `After<Channel>`: typestate steps returned by each factory; later channels chain off them
 *     (`params(...).headers(...)`). Only steps whose remaining channels are all optional implement
 *     `Args`, so omitting a required channel is a compile error, not a runtime one.
 */
const emitArgsScaffolding = (writer: KotlinWriter, method: RouteMethod, context: EmitContext): void => {
    const channels = methodChannels(method).map((channel) => ({
        ...channel,
        fields: channel.fields.map((field) => ({
            ...field,
            type: resolveChannelFieldType(field, method, context),
        })),
    }));
    if (channels.length === 0) return;

    // `lastDecidedIndex` = index of the last channel the caller has provided (-1 in `Scope`).
    const isTerminal = (lastDecidedIndex: number): boolean => channels.slice(lastDecidedIndex + 1).every((channel) => !channel.required);

    const transitionsFrom = (lastDecidedIndex: number): number[] => {
        const targets: number[] = [];
        for (let target = lastDecidedIndex + 1; target < channels.length; target += 1) {
            const skipped = channels.slice(lastDecidedIndex + 1, target);
            if (skipped.every((channel) => !channel.required)) targets.push(target);
        }
        return targets;
    };

    const factorySignature = (channel: MethodChannel): string =>
        channel.fields
            .map((field) => {
                const typeExpression = optionalize(field.type, field.optional);
                const defaultPart = field.optional ? ' = null' : '';
                return `${escapeKeyword(field.name)}: ${typeExpression}${defaultPart}`;
            })
            .join(', ');

    const factoryConstruction = (channel: MethodChannel): string => {
        const args = channel.fields.map((field) => `${escapeKeyword(field.name)} = ${escapeKeyword(field.name)}`).join(', ');
        return `${channel.className}(${args})`;
    };

    const emitTransition = (fromIndex: number, toIndex: number): void => {
        const target = channels[toIndex]!;
        const constructorArgs: string[] = [];
        for (let index = 0; index <= toIndex; index += 1) {
            const channel = channels[index]!;
            if (index < toIndex) {
                constructorArgs.push(`${channel.varName} = ${index <= fromIndex ? channel.varName : 'null'}`);
            } else {
                constructorArgs.push(`${channel.varName} = ${factoryConstruction(channel)}`);
            }
        }
        writer.line(
            `fun ${escapeKeyword(target.varName)}(${factorySignature(target)}): After${target.className} = After${target.className}(${constructorArgs.join(', ')})`
        );
    };

    writer.blank();
    writer.block('sealed interface Args', () => {
        for (const channel of channels) {
            writer.line(`val ${channel.varName}: ${channel.className}${channel.required ? '' : '?'}`);
        }
    });

    writer.blank();
    writer.block('object Scope', () => {
        for (const target of transitionsFrom(-1)) emitTransition(-1, target);
    });

    for (let stateIndex = 0; stateIndex < channels.length; stateIndex += 1) {
        const stateChannel = channels[stateIndex]!;
        const terminal = isTerminal(stateIndex);
        const constructorParams: string[] = [];
        for (let index = 0; index <= stateIndex; index += 1) {
            const channel = channels[index]!;
            const modifier = terminal ? 'override val' : 'internal val';
            constructorParams.push(`${modifier} ${channel.varName}: ${channel.className}${channel.required ? '' : '?'}`);
        }
        const declaration = `class After${stateChannel.className} internal constructor(${constructorParams.join(', ')})${terminal ? ' : Args' : ''}`;
        const undecidedOverrides = terminal ? channels.slice(stateIndex + 1) : [];
        const transitions = transitionsFrom(stateIndex);
        writer.blank();
        if (undecidedOverrides.length === 0 && transitions.length === 0) {
            writer.line(declaration);
        } else {
            writer.block(declaration, () => {
                for (const channel of undecidedOverrides) {
                    writer.line(`override val ${channel.varName}: ${channel.className}? get() = null`);
                }
                for (const target of transitions) emitTransition(stateIndex, target);
            });
        }
    }
};

// The request-builder lambda must return `Args`, so required channels are enforced at compile time.
// When every channel is optional the lambda defaults to an empty first-channel call.
const buildMethodParameters = (method: RouteMethod, context: EmitContext): string[] => {
    const channels = methodChannels(method);
    if (channels.length === 0) return [];
    const operationRef = `${context.clientName}.${method.operationName}`;
    const allOptional = channels.every((channel) => !channel.required);
    const defaultPart = allOptional ? ` = { ${escapeKeyword(channels[0]!.varName)}() }` : '';
    return [`build: ${operationRef}.Scope.() -> ${operationRef}.Args${defaultPart}`];
};

const emitBodyEncoding = (writer: KotlinWriter, method: RouteMethod, context: EmitContext): void => {
    if (!method.body) return;
    const body = method.body;

    if (body.kind === 'multipart') {
        writer.line('val multipartBuilder = MultipartBody.Builder().setType(MultipartBody.FORM)');
        for (const field of body.multipartFields) {
            const accessor = groupMemberAccessor('body', field);
            const isFlattenedFile = body.flattened.find((flatField) => flatField.name === field.name)?.isFile === true;
            if (field.isFile || isFlattenedFile) {
                writer.line(
                    `multipartBuilder.addFormDataPart(${stringLiteral(field.wireName)}, ${accessor}.filename, ${accessor}.data.toRequestBody(${accessor}.mimeType.toMediaType()))`
                );
            } else {
                writer.line(`multipartBuilder.addFormDataPart(${stringLiteral(field.wireName)}, ${accessor}.toString())`);
            }
        }
        writer.line('requestBody = multipartBuilder.build()');
        return;
    }

    if (body.kind === 'json-empty') {
        writer.line('requestBody = "{}".toRequestBody("application/json".toMediaType())');
        return;
    }
    if (body.kind === 'json-struct' || body.kind === 'union') {
        writer.line('requestBody = json.encodeToString(body.payload).toRequestBody("application/json".toMediaType())');
        return;
    }
    if (body.kind === 'json-flat' && body.structName) {
        const resolved = resolveType(body.structName, method.operationName, context);
        const args = body.flattened.map((field) => `${field.name} = ${groupMemberAccessor('body', field)}`).join(', ');
        writer.line(`val payload = ${resolved}(${args})`);
        writer.line('requestBody = json.encodeToString(payload).toRequestBody("application/json".toMediaType())');
    }
};

const emitMethodBody = (writer: KotlinWriter, method: RouteMethod, context: EmitContext): void => {
    const operationRef = `${context.clientName}.${method.operationName}`;
    const failureRef = `${operationRef}.Failure`;
    const hasBody = method.body !== undefined;
    const isMultiSuccess = method.successResponses.length > 1;
    const isVoidSuccess = isVoidSuccessMethod(method);
    const hasHeaders = method.resultHeaderFields.length > 0;

    // Run the request-builder lambda, then bind each channel to a local so the request code below
    // reads `params.id`, `query.page`, etc. Skipped all-optional channels fall back to empty instances.
    const channels = methodChannels(method);
    if (channels.length > 0) {
        writer.line(`val args = ${operationRef}.Scope.build()`);
        for (const channel of channels) {
            const groupRef = groupTypeRef(method.operationName, channel.className, context);
            if (channel.required) {
                writer.line(`val ${channel.varName} = args.${channel.varName}`);
            } else {
                writer.line(`val ${channel.varName} = args.${channel.varName} ?: ${groupRef}()`);
            }
        }
    }

    writer.line(`${method.pathParams.length > 0 ? 'var' : 'val'} path = ${stringLiteral(method.pathTemplate)}`);
    for (const field of pathParamFields(method)) {
        const accessor = groupMemberAccessor('params', field);
        writer.line(`path = path.replace(${stringLiteral(`:${field.name}`)}, Kizuna.encodePathSegment(${accessor}))`);
    }

    writer.line('val urlBuilder = Kizuna.resolveUrl(baseUrl, path)');

    if (method.query.length > 0) {
        for (const field of method.query) {
            const accessor = groupMemberAccessor('query', field);
            const appendBlock = (sourceExpression: string): void => {
                writer.block(`for (stringValue in Kizuna.stringifyQueryValue(${sourceExpression}))`, () => {
                    writer.line(`urlBuilder.addQueryParameter(${stringLiteral(field.wireName)}, stringValue)`);
                });
            };
            if (field.optional) {
                writer.block(`if (${accessor} != null)`, () => {
                    appendBlock(accessor);
                });
            } else {
                appendBlock(accessor);
            }
        }
    }

    if (hasBody) {
        writer.line('val requestBody: RequestBody');
        emitBodyEncoding(writer, method, context);
    }

    const builderReassigned = context.requestContextFields.length > 0 || method.headers.length > 0;
    writer.line(`${builderReassigned ? 'var' : 'val'} requestBuilder = Request.Builder()`);
    writer.line('    .url(urlBuilder.build())');
    if (hasBody) {
        writer.line(`    .method(${stringLiteral(method.method)}, requestBody)`);
    } else if (METHODS_REQUIRING_BODY.has(method.method)) {
        // OkHttp rejects POST/PUT/PATCH with a null body, so send an empty one.
        writer.line(`    .method(${stringLiteral(method.method)}, ByteArray(0).toRequestBody(null))`);
    } else {
        writer.line(`    .method(${stringLiteral(method.method)}, null)`);
    }

    if (context.requestContextFields.length > 0) {
        writer.line('for ((name, value) in requestContextHeaders) requestBuilder = requestBuilder.header(name, value)');
    }

    for (const field of method.headers) {
        const accessor = groupMemberAccessor('headers', field);
        const setHeader = (sourceExpression: string): void => {
            writer.line(
                `requestBuilder = requestBuilder.header(${stringLiteral(field.wireName)}, Kizuna.stringifyQueryValue(${sourceExpression}).joinToString(", "))`
            );
        };
        if (field.optional) {
            writer.block(`if (${accessor} != null)`, () => {
                setHeader(accessor);
            });
        } else {
            setHeader(accessor);
        }
    }

    writer.line('requestInterceptor?.invoke(requestBuilder)');

    writer.line('val httpResponse = Kizuna.execute(client, requestBuilder.build())');
    if (method.stream) {
        emitStreamMethodTail(writer, method, context);
        return;
    }
    writer.line(`${isVoidSuccess ? '' : 'return '}httpResponse.use {`);
    writer.indent(() => {
        writer.line('responseInterceptor?.invoke(requestBuilder.build(), httpResponse)');
        writer.line(
            'val data = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { httpResponse.body?.bytes() ?: ByteArray(0) }'
        );
        writer.line('when (val statusCode = httpResponse.code) {');
        writer.indent(() => {
            for (const successResponse of method.successResponses) {
                if (isVoidSuccess) {
                    writer.line(`${successResponse.status} -> {}`);
                    continue;
                }
                writer.line(`${successResponse.status} -> {`);
                writer.indent(() => {
                    const resolved = resolveType(successResponse.type, method.operationName, context);
                    writer.block('try', () => {
                        writer.line(`val payload = json.decodeFromString<${resolved}>(data.decodeToString())`);
                        const bodyExpr = isMultiSuccess ? `${operationRef}.Success.Status${successResponse.status}(payload)` : 'payload';
                        if (hasHeaders) {
                            for (const field of successResponse.responseHeaders) {
                                writer.line(`val ${escapeKeyword(field.name)} = httpResponse.header(${stringLiteral(field.wireName)})`);
                            }
                            const headersArgs = method.resultHeaderFields
                                .map((field) => `${escapeKeyword(field.name)} = ${escapeKeyword(field.name)}`)
                                .join(', ');
                            writer.line(
                                `return@use ${operationRef}.Result(body = ${bodyExpr}, headers = ${operationRef}.Result.Headers(${headersArgs}))`
                            );
                        } else {
                            writer.line(`return@use ${operationRef}.Result(body = ${bodyExpr})`);
                        }
                    });
                    writer.line(`catch (error: Exception) { throw ${failureRef}.Decoding(error, statusCode, data) }`);
                });
                writer.line('}');
            }

            emitErrorBranches(writer, method, context);
        });
        writer.line('}');
    });
    writer.line('}');
};

// The `<status> -> { ... }` branches for every declared error plus the `else`, reading the body from `data`.
const emitErrorBranches = (writer: KotlinWriter, method: RouteMethod, context: EmitContext): void => {
    const operationRef = `${context.clientName}.${method.operationName}`;
    const failureRef = `${operationRef}.Failure`;
    const grouped = new Map<number, typeof method.errorCases>();
    for (const errorCase of method.errorCases) {
        const existing = grouped.get(errorCase.status);
        if (existing) {
            existing.push(errorCase);
        } else {
            grouped.set(errorCase.status, [errorCase]);
        }
    }
    for (const [status, cases] of grouped) {
        writer.line(`${status} -> {`);
        writer.indent(() => {
            if (cases.length === 1) {
                const errorCase = cases[0]!;
                const caseName = toPascalCase(errorCase.caseName);
                if (errorCase.type === 'Unit') {
                    writer.line(`throw ${failureRef}.${caseName}`);
                } else {
                    const resolved = resolveType(errorCase.type, method.operationName, context);
                    writer.line('val payload = try {');
                    writer.indent(() => {
                        writer.line(`json.decodeFromString<${resolved}>(data.decodeToString())`);
                    });
                    writer.line(`} catch (error: Exception) { throw ${failureRef}.Decoding(error, statusCode, data) }`);
                    writer.line(`throw ${failureRef}.${caseName}(body = payload)`);
                }
            } else {
                for (const errorCase of cases) {
                    const caseName = toPascalCase(errorCase.caseName);
                    if (errorCase.type === 'Unit') {
                        writer.line(`throw ${failureRef}.${caseName}`);
                    } else {
                        const resolved = resolveType(errorCase.type, method.operationName, context);
                        writer.line(`val ${errorCase.caseName} = try {`);
                        writer.indent(() => {
                            writer.line(`json.decodeFromString<${resolved}>(data.decodeToString())`);
                        });
                        writer.line('} catch (_: Exception) { null }');
                        writer.line(`if (${errorCase.caseName} != null) throw ${failureRef}.${caseName}(body = ${errorCase.caseName})`);
                    }
                }
                writer.line(`throw ${failureRef}.Unexpected(statusCode = statusCode, data = data)`);
            }
        });
        writer.line('}');
    }
    writer.line(`else -> throw ${failureRef}.Unexpected(statusCode = statusCode, data = data)`);
};

const emitStreamMethodTail = (writer: KotlinWriter, method: RouteMethod, context: EmitContext): void => {
    const operationRef = `${context.clientName}.${method.operationName}`;
    const stream = method.stream!;
    const successResponse = method.successResponses.find((candidate) => candidate.status === stream.status)!;
    const hasHeaders = method.resultHeaderFields.length > 0;
    writer.line('responseInterceptor?.invoke(requestBuilder.build(), httpResponse)');
    writer.block(`if (httpResponse.code == ${stream.status})`, () => {
        if (stream.mode === 'text') {
            writer.line('val stream = Kizuna.lines(httpResponse)');
        } else if (stream.mode === 'binary') {
            writer.line('val stream = Kizuna.chunks(httpResponse)');
        } else if (stream.events) {
            const events = stream.events;
            const elementType = streamElementType(method, context, 'client');
            closure(writer, `val stream = Kizuna.events<${elementType}>(httpResponse) { event ->`, () => {
                writer.block('when (event.event)', () => {
                    for (const event of events) {
                        const payloadType = resolveType(event.type, method.operationName, context);
                        writer.line(
                            `${stringLiteral(event.name)} -> ${elementType}.${event.caseName}(json.decodeFromString<${payloadType}>(event.data))`
                        );
                    }
                    writer.line('else -> null');
                });
            });
        } else {
            const elementType = streamElementType(method, context, 'client');
            writer.line(
                `val stream = Kizuna.events<${elementType}>(httpResponse) { event -> json.decodeFromString<${elementType}>(event.data) }`
            );
        }
        if (hasHeaders) {
            for (const field of successResponse.responseHeaders) {
                writer.line(`val ${escapeKeyword(field.name)} = httpResponse.header(${stringLiteral(field.wireName)})`);
            }
            const headersArgs = method.resultHeaderFields
                .map((field) => `${escapeKeyword(field.name)} = ${escapeKeyword(field.name)}`)
                .join(', ');
            writer.line(`return ${operationRef}.Result(stream = stream, headers = ${operationRef}.Result.Headers(${headersArgs}))`);
        } else {
            writer.line(`return ${operationRef}.Result(stream = stream)`);
        }
    });
    writer.line('return httpResponse.use {');
    writer.indent(() => {
        writer.line(
            'val data = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { httpResponse.body?.bytes() ?: ByteArray(0) }'
        );
        writer.line('when (val statusCode = httpResponse.code) {');
        writer.indent(() => {
            emitErrorBranches(writer, method, context);
        });
        writer.line('}');
    });
    writer.line('}');
};

const resultRef = (method: RouteMethod, context: EmitContext): string => `${context.clientName}.${method.operationName}.Result`;

const buildMethodSignature = (method: RouteMethod, context: EmitContext): string => {
    const params = buildMethodParameters(method, context);
    const returnType = isVoidSuccessMethod(method) ? '' : `: ${resultRef(method, context)}`;
    return `suspend fun ${escapeKeyword(method.name)}(${params.join(', ')})${returnType}`;
};

const emitMethodDoc = (writer: KotlinWriter, method: RouteMethod): void => {
    writer.docComment(method.summary ?? method.description);
};

const emitMethod = (writer: KotlinWriter, method: RouteMethod, context: EmitContext): void => {
    emitMethodDoc(writer, method);
    if (method.deprecated) {
        writer.line(deprecatedAnnotation(method.deprecationMessage));
    }
    writer.line(`@Throws(${context.clientName}.${method.operationName}.Failure::class)`);
    writer.block(buildMethodSignature(method, context), () => {
        emitMethodBody(writer, method, context);
    });
};

const emitSubClientMethod = (writer: KotlinWriter, method: RouteMethod, context: EmitContext): void => {
    emitMethodDoc(writer, method);
    if (method.deprecated) {
        writer.line(deprecatedAnnotation(method.deprecationMessage));
    }
    writer.line(`@Throws(${context.clientName}.${method.operationName}.Failure::class)`);
    writer.block(buildMethodSignature(method, context), () => {
        emitMethodBody(writer, method, context);
    });
};

const emitSubClientClass = (writer: KotlinWriter, group: RouteGroup, clientName: string, context: EmitContext): void => {
    writer.blank();
    writer.block(
        `class ${group.className}(private val client: OkHttpClient, private val baseUrl: String, private val json: Json, private val requestContextHeaders: Map<String, String>, private val requestInterceptor: (suspend (Request.Builder) -> Unit)?, private val responseInterceptor: (suspend (Request, Response) -> Unit)?)`,
        () => {
            for (const method of group.methods) {
                writer.blank();
                emitSubClientMethod(writer, method, context);
            }
        }
    );
};

// An opener that already carries its `{`, such as a lambda, so `block` must not add one.
const closure = (writer: KotlinWriter, opener: string, body: () => void): void => {
    writer.line(opener);
    writer.indent(body);
    writer.line('}');
};

const emitKizunaStreaming = (writer: KotlinWriter): void => {
    writer.blank();
    writer.line('data class ServerSentEvent(val event: String?, val data: String, val id: String?, val retry: Int?)');
    writer.blank();
    writer.block('private suspend fun readLine(source: okio.BufferedSource): String?', () => {
        writer.line('return kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { source.readUtf8Line() }');
    });
    writer.blank();
    writer.block('fun lines(response: Response): Flow<String> = flow', () => {
        closure(writer, 'response.use { open ->', () => {
            writer.line('val source = open.body?.source() ?: return@use');
            writer.block('while (true)', () => {
                writer.line('val line = readLine(source) ?: break');
                writer.line('emit(line)');
            });
        });
    });
    writer.blank();
    writer.block('fun chunks(response: Response): Flow<ByteArray> = flow', () => {
        closure(writer, 'response.use { open ->', () => {
            writer.line('val source = open.body?.source() ?: return@use');
            writer.line('val buffer = ByteArray(16_384)');
            writer.block('while (true)', () => {
                writer.line('val read = kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { source.read(buffer) }');
                writer.line('if (read == -1) break');
                writer.line('emit(buffer.copyOf(read))');
            });
        });
    });
    writer.blank();
    writer.block('fun serverSentEvents(response: Response): Flow<ServerSentEvent> = flow', () => {
        closure(writer, 'response.use { open ->', () => {
            writer.line('val source = open.body?.source() ?: return@use');
            writer.line('var eventType = ""');
            writer.line('val dataLines = mutableListOf<String>()');
            writer.line('var lastEventId = ""');
            writer.line('var retry: Int? = null');
            writer.block('while (true)', () => {
                writer.line('val line = readLine(source) ?: break');
                writer.block('if (line.isEmpty())', () => {
                    writer.block('if (dataLines.isNotEmpty())', () => {
                        writer.line(
                            'emit(ServerSentEvent(eventType.ifEmpty { null }, dataLines.joinToString("\\n"), lastEventId.ifEmpty { null }, retry))'
                        );
                        writer.line('dataLines.clear()');
                        writer.line('retry = null');
                    });
                    writer.line('eventType = ""');
                    writer.line('continue');
                });
                writer.line('if (line.startsWith(":")) continue');
                writer.line("val separator = line.indexOf(':')");
                writer.line('val field = if (separator == -1) line else line.substring(0, separator)');
                writer.line('val value = (if (separator == -1) "" else line.substring(separator + 1)).removePrefix(" ")');
                writer.block('when (field)', () => {
                    writer.line('"event" -> eventType = value');
                    writer.line('"data" -> dataLines.add(value)');
                    writer.line('"id" -> if (!value.contains(\'\\u0000\')) lastEventId = value');
                    writer.line('"retry" -> if (value.isNotEmpty() && value.all { it.isDigit() }) retry = value.toIntOrNull()');
                });
            });
        });
    });
    writer.blank();
    writer.line(
        'fun <Event : Any> events(response: Response, decode: (ServerSentEvent) -> Event?): Flow<Event> = serverSentEvents(response).mapNotNull(decode)'
    );
};

const emitKizunaObject = (writer: KotlinWriter, options: { streaming: boolean }): void => {
    writer.blank();
    writer.block('private object Kizuna', () => {
        if (options.streaming) emitKizunaStreaming(writer);
        writer.block('fun resolveUrl(baseUrl: String, path: String): HttpUrl.Builder', () => {
            writer.line('val base = baseUrl.toHttpUrl()');
            writer.line("val trimmedPath = path.trimStart('/')");
            writer.line("val basePath = base.encodedPath.trimEnd('/')");
            writer.line('val fullPath = if (basePath.isEmpty()) "/$trimmedPath" else "$basePath/$trimmedPath"');
            writer.line('return base.newBuilder().encodedPath(fullPath)');
        });
        writer.blank();
        writer.block('fun encodePathSegment(value: Any): String', () => {
            writer.line('val text = stringifyQueryValue(value).firstOrNull() ?: ""');
            writer.line('return java.net.URLEncoder.encode(text, "UTF-8").replace("+", "%20")');
        });
        writer.blank();
        writer.block('fun stringifyQueryValue(value: Any): List<String>', () => {
            writer.line('return when (value) {');
            writer.indent(() => {
                writer.line('is Instant -> listOf(value.toString())');
                writer.line('is List<*> -> value.filterNotNull().flatMap { stringifyQueryValue(it) }');
                writer.line('is KizunaQueryValue -> listOf(value.wireValue)');
                writer.line('is Enum<*> -> listOf(value.name)');
                writer.line('else -> listOf(value.toString())');
            });
            writer.line('}');
        });
        writer.blank();
        writer.block('suspend fun execute(client: OkHttpClient, request: Request): Response', () => {
            writer.line('return kotlinx.coroutines.suspendCancellableCoroutine { continuation ->');
            writer.indent(() => {
                writer.line('val call = client.newCall(request)');
                writer.block('continuation.invokeOnCancellation', () => {
                    writer.line('call.cancel()');
                });
                writer.block('call.enqueue(object : Callback', () => {
                    writer.block('override fun onFailure(call: Call, e: java.io.IOException)', () => {
                        writer.line('continuation.resumeWith(Result.failure(e))');
                    });
                    writer.block('override fun onResponse(call: Call, response: Response)', () => {
                        writer.line('continuation.resumeWith(Result.success(response))');
                    });
                });
                writer.line(')');
            });
            writer.line('}');
        });
    });
};

const emitClient = (
    writer: KotlinWriter,
    config: { clientName: string },
    partition: ContractPartition,
    context: EmitContext,
    typesByOperation: Map<string, KotlinType[]>,
    registry: TypeRegistry
): void => {
    const { clientName } = config;
    const { flatMethods, groups } = partition;
    const allMethods = [...flatMethods, ...groups.flatMap((group) => group.methods)];

    const usesMultipart = allMethods.some((method) => method.body?.kind === 'multipart');

    const contextFields = context.requestContextFields;
    const contextRequired = contextFields.some((field) => !field.optional);
    const contextParam = contextFields.length > 0 ? `requestContext: RequestContext${contextRequired ? '' : ' = RequestContext()'}, ` : '';

    writer.blank();
    writer.block(
        `class ${clientName}(private val baseUrl: String, ${contextParam}private val client: OkHttpClient = OkHttpClient(), private val json: Json = Json { ignoreUnknownKeys = true }, private val requestInterceptor: (suspend (Request.Builder) -> Unit)? = null, private val responseInterceptor: (suspend (Request, Response) -> Unit)? = null)`,
        () => {
            if (contextFields.length > 0) {
                writer.blank();
                writer.line("/** Values sent as headers on every request, from the contract's request context. */");
                emitConstructorClass(
                    writer,
                    'data class RequestContext',
                    contextFields.map((field) => `val ${escapeKeyword(field.name)}: ${field.type}${field.optional ? ' = null' : ''}`)
                );
                writer.blank();
                writer.block('private val requestContextHeaders: Map<String, String> = buildMap', () => {
                    for (const field of contextFields) {
                        if (field.optional) {
                            writer.line(
                                `if (requestContext.${escapeKeyword(field.name)} != null) put(${stringLiteral(field.wireName)}, requestContext.${escapeKeyword(field.name)}!!)`
                            );
                        } else {
                            writer.line(`put(${stringLiteral(field.wireName)}, requestContext.${escapeKeyword(field.name)})`);
                        }
                    }
                });
            }
            if (usesMultipart) {
                writer.blank();
                emitConstructorClass(writer, 'data class MultipartFile', [
                    'val data: ByteArray',
                    'val filename: String',
                    'val mimeType: String = "application/octet-stream"',
                ]);
                writer.appendToLastLine(' {');
                writer.indent(() => {
                    emitByteArrayEquality(writer, 'MultipartFile', [
                        { name: 'data', isByteArray: true },
                        { name: 'filename', isByteArray: false },
                        { name: 'mimeType', isByteArray: false },
                    ]);
                });
                writer.line('}');
            }
            const hasValidation = allMethods.some((method) => method.errorCases.some((candidate) => candidate.type === 'ValidationError'));
            if (hasValidation) {
                writer.blank();
                writer.line('@Serializable');
                emitConstructorClass(writer, 'data class ValidationError', [
                    'val type: String',
                    'val title: String',
                    'val status: Int',
                    'val detail: String',
                    'val errors: List<ValidationIssue>',
                ]);
                writer.blank();
                writer.line('@Serializable');
                emitConstructorClass(writer, 'data class ValidationIssue', [
                    'val code: String',
                    'val path: List<String>',
                    'val message: String',
                ]);
            }

            for (const method of allMethods) {
                const localTypes = (typesByOperation.get(method.operationName) ?? []).map((type) =>
                    localizeType(type, method.operationName, context)
                );
                writer.blank();
                writer.block(`object ${method.operationName}`, () => {
                    emitTypes(writer, localTypes, undefined, undefined, registry);
                    emitRequestGroupClasses(writer, method, context);
                    emitOperationResultTypes(writer, method, context);
                });
            }

            if (groups.length > 0) {
                for (const group of groups) {
                    writer.blank();
                    writer.line(
                        `val ${escapeKeyword(group.propertyName)} = ${group.className}(client, baseUrl, json, ${contextFields.length > 0 ? 'requestContextHeaders' : 'emptyMap()'}, requestInterceptor, responseInterceptor)`
                    );
                }
            }

            for (const method of flatMethods) {
                writer.blank();
                emitMethod(writer, method, context);
            }
        }
    );
};

/**
 * Generate a Kotlin API client from a ts-kizuna contract.
 *
 * @param contract - The router from `k.contract({ ... })`.
 * @param config - Override the generated names:
 *   - `namespaceName`: the object wrapping shared types.
 *   - `packageName`: optional package declaration for the generated file.
 */
export const generateKotlinClient = (contract: Contract, config: KotlinConfig): string => {
    const { namespaceName, packageName, camelCaseProperties = false, unknownEnumCase = false } = config;

    const registry = new TypeRegistry(camelCaseProperties, unknownEnumCase);
    const partition = kotlinGenerator(contract, {
        namespaceName,
        registry,
    });
    const allMethods = [...partition.flatMethods, ...partition.groups.flatMap((group: RouteGroup) => group.methods)];

    const operationTypeMap = buildOperationTypeMap(allMethods, registry);
    const clientName = `${namespaceName}Client`;

    const writer = new KotlinWriter();
    writer.line('// Generated by @ts-kizuna/kotlin. Do not edit by hand.');
    writer.blank();
    // Snake_case naming inspections only apply to verbatim wire names; the rest always apply.
    const suppressions = [
        ...(camelCaseProperties ? [] : ['PropertyName', 'LocalVariableName', 'ConstructorParameterNaming']),
        'SpellCheckingInspection',
        'unused',
        'RedundantVisibilityModifier',
        'RedundantUnitReturnType',
    ];
    writer.line(`@file:Suppress(${suppressions.map((name) => `"${name}"`).join(', ')})`);
    writer.blank();
    if (packageName) {
        writer.line(`package ${packageName}`);
        writer.blank();
    }
    writer.line('import kotlinx.serialization.*');
    writer.line('import kotlinx.serialization.json.*');
    const hasTolerantEnums = registry.all().some((type) => type.kind === 'enum-class' && type.unknownCase);
    if (hasTolerantEnums) {
        writer.line('import kotlinx.serialization.descriptors.*');
        writer.line('import kotlinx.serialization.encoding.*');
    }
    writer.line('import kotlinx.datetime.Instant');
    const usesStreaming = allMethods.some((method) => method.stream !== undefined);
    if (usesStreaming) {
        writer.line('import kotlinx.coroutines.flow.*');
    }
    writer.line('import okhttp3.*');
    writer.line('import okhttp3.MediaType.Companion.toMediaType');
    writer.line('import okhttp3.RequestBody.Companion.toRequestBody');
    writer.line('import okhttp3.HttpUrl.Companion.toHttpUrl');
    writer.blank();

    const hasEnums = registry.all().some((type) => type.kind === 'enum-class');
    if (hasEnums) {
        writer.block('interface KizunaQueryValue', () => {
            writer.line('val wireValue: String');
        });
        writer.blank();
    }

    const sharedTypes: KotlinType[] = [];
    const typesByOperation = new Map<string, KotlinType[]>();
    for (const type of registry.all()) {
        const owningOp = operationTypeMap.get(type.name);
        if (owningOp !== undefined) {
            const bucket = typesByOperation.get(owningOp) ?? [];
            if (bucket.length === 0) typesByOperation.set(owningOp, bucket);
            bucket.push(type);
        } else {
            sharedTypes.push(type);
        }
    }
    const fileLevelTypeNames = new Set<string>();

    const allClassNames = sharedTypes.filter((type) => type.kind === 'data-class').map((type) => type.name);
    const ownedTypeMap = new Map<string, string>();
    for (const type of sharedTypes) {
        if (registry.isExplicitId(type.name)) continue;
        if (registry.isSealedVariantPayload(type.name)) continue;
        let bestMatch: string | undefined;
        for (const className of allClassNames) {
            if (className === type.name) continue;
            if (isHintPrefix(type.name, className) && (!bestMatch || className.length > bestMatch.length)) {
                bestMatch = className;
            }
        }
        if (bestMatch !== undefined) ownedTypeMap.set(type.name, bestMatch);
    }
    const ownedTypeLookup = new Map(sharedTypes.filter((type) => ownedTypeMap.has(type.name)).map((type) => [type.name, type]));
    const topLevelSharedTypes = sharedTypes.filter((type) => !ownedTypeMap.has(type.name) && !registry.isSealedVariantPayload(type.name));

    const requestContextFields: KotlinField[] = [];
    for (const declaration of Object.values(contract.requestContext ?? {})) {
        const headersSchema = (declaration as { headers?: z.ZodType }).headers;
        if (!headersSchema) continue;
        requestContextFields.push(...collectObjectFields(headersSchema, registry, 'RequestContext'));
    }

    const context: EmitContext = {
        namespaceName,
        clientName,
        operationTypeMap,
        fileLevelTypeNames,
        ownedTypeMap,
        requestContextFields,
    };

    writer.block(`object ${namespaceName}`, () => {
        emitTypes(writer, topLevelSharedTypes, ownedTypeMap, ownedTypeLookup, registry);
    });

    emitClient(writer, { clientName }, partition, context, typesByOperation, registry);

    for (const group of partition.groups) {
        emitSubClientClass(writer, group, clientName, context);
    }

    emitKizunaObject(writer, {
        streaming: usesStreaming,
    });

    for (const warning of registry.warnings()) {
        process.stderr.write(`[ts-kizuna/kotlin] JsonElement fallback at ${warning}\n`);
    }

    return writer.toString();
};
