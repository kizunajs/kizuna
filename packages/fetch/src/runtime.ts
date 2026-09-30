/**
 * The code every generated client runs, written into the file below its route
 * table. It imports nothing, so a client installs nothing, and it always comes
 * from the release that wrote the table it reads.
 */
export const runtimeSource = String.raw`/**
 * What the client knows about one response: nothing for a body it reads as
 * JSON, the media type for one that streams.
 */
export type GeneratedResponse =
    | Record<string, never>
    | {
          stream: true;
          contentType: string;
      };

/**
 * The static message a rule was given, keyed by the code it fails with.
 */
export type RuleMessages = Record<string, string | undefined>;

interface RuleBase {
    required: boolean;
    nullable: boolean;
    messages: RuleMessages;
}

/**
 * One field's rules, as the generator wrote them from the route's schema.
 */
export type RuleNode =
    | (RuleBase & {
          kind: 'object';
          fields: Record<string, RuleNode>;
          strict: boolean;
      })
    | (RuleBase & {
          kind: 'array';
          items: RuleNode;
          minItems?: number;
          maxItems?: number;
      })
    | (RuleBase & {
          kind: 'string';
          minLength?: number;
          maxLength?: number;
          length?: number;
          format?: string;
          pattern?: string;
      })
    | (RuleBase & {
          kind: 'number';
          integer: boolean;
          minimum?: number;
          maximum?: number;
          exclusiveMinimum?: number;
          exclusiveMaximum?: number;
          multipleOf?: number;
      })
    | (RuleBase & {
          kind: 'boolean';
      })
    | (RuleBase & {
          kind: 'enum';
          values: Array<string | number | boolean | null>;
      })
    | (RuleBase & {
          kind: 'unknown';
      });

/**
 * A route's rules per request part.
 */
export interface RequestRules {
    params?: RuleNode;
    query?: RuleNode;
    headers?: RuleNode;
    body?: RuleNode;
}

/**
 * One route in the table: how to reach it, how to read each status it
 * answers with, and the rules its request has to meet.
 */
export interface GeneratedRoute {
    method: string;
    path: string;
    contentType?: string;
    responses: Record<number, GeneratedResponse>;
    rules?: RequestRules;
}

/**
 * The route table, nested the way the client is.
 */
export interface GeneratedRoutes {
    [key: string]: GeneratedRoutes | GeneratedRoute;
}

/**
 * One failed rule as it is on the wire: a code, the path to the field, a
 * developer-facing message, and the rule's values beside them.
 */
export interface ValidationIssueRecord {
    code: string;
    path: string[];
    message: string;
    [value: string]: unknown;
}

/**
 * The 400 the server answers with, and what check returns before a request
 * is sent.
 */
export interface ValidationProblem {
    type: string;
    title: string;
    status: number;
    detail: string;
    errors: ValidationIssueRecord[];
}

/**
 * The HTML constraint attributes a field's rules amount to, so a plain input
 * validates in the browser.
 */
export interface InputAttributes {
    type?: 'email' | 'url' | 'number' | 'text';
    inputMode?: 'numeric' | 'decimal' | 'email' | 'url';
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    min?: number;
    max?: number;
    step?: number | 'any';
    pattern?: string;
}

/**
 * What every node of the rules tree can do.
 */
export interface FieldRules {
    readonly required: boolean;
    readonly nullable: boolean;
    readonly messages: RuleMessages;
    /**
     * Checks one value against this field's rules, as the server would.
     */
    check(value: unknown): ValidationIssueRecord | undefined;
    /**
     * The HTML constraint attributes for an input bound to this field.
     */
    attributes(): InputAttributes;
}

export interface StringRules extends FieldRules {
    readonly kind: 'string';
    readonly minLength?: number;
    readonly maxLength?: number;
    readonly length?: number;
    readonly format?: string;
    readonly pattern?: string;
}

export interface NumberRules extends FieldRules {
    readonly kind: 'number';
    readonly integer: boolean;
    readonly minimum?: number;
    readonly maximum?: number;
    readonly exclusiveMinimum?: number;
    readonly exclusiveMaximum?: number;
    readonly multipleOf?: number;
}

export interface BooleanRules extends FieldRules {
    readonly kind: 'boolean';
}

export interface EnumRules extends FieldRules {
    readonly kind: 'enum';
    readonly values: ReadonlyArray<string | number | boolean | null>;
}

export interface UnknownRules extends FieldRules {
    readonly kind: 'unknown';
}

export interface ArrayRules<Items extends FieldRules = FieldRules> extends FieldRules {
    readonly kind: 'array';
    readonly items: Items;
    readonly minItems?: number;
    readonly maxItems?: number;
}

export interface ObjectRules<Fields extends Record<string, FieldRules> = Record<string, FieldRules>> extends FieldRules {
    readonly kind: 'object';
    readonly strict: boolean;
    readonly fields: Fields;
}

/**
 * The request onRequest receives before it is sent. A header set on headers
 * is sent with it.
 */
export interface OutgoingRequest {
    url: string;
    method: string;
    headers: Headers;
    route: GeneratedRoute;
}

/**
 * Where the client sends its requests, and what it adds to each one.
 */
export interface ClientConfig {
    baseUrl: string;
    baseHeaders?: Record<string, string>;
    credentials?: RequestCredentials;
    fetch?: typeof fetch;
    onRequest?: (request: OutgoingRequest) => void | Promise<void>;
}

/**
 * One method on the client. Its '~route' names the method it sends and
 * whether its response streams, so a wrapper like @kizunajs/tanstack-query
 * reads both off the client.
 */
export type ClientMethod<Method extends string, Streams extends boolean, Args, Result> = ({} extends Args
    ? (args?: Args) => Promise<Result>
    : (args: Args) => Promise<Result>) & {
    readonly '~route': GeneratedRoute & {
        readonly method: Method;
        readonly streams: Streams;
    };
};

interface CallArgs {
    params?: Record<string, unknown>;
    query?: Record<string, unknown>;
    body?: unknown;
    form?: FormData;
    headers?: Record<string, string | undefined>;
    fetchOptions?: RequestInit;
}

/**
 * Dates go on the wire as ISO 8601, everything else as String gives it.
 */
const serializeValue = (value: unknown): string => (value instanceof Date ? value.toISOString() : String(value));

const buildPath = (path: string, params: Record<string, unknown> = {}): string =>
    path.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name: string) => {
        const value = params[name];
        if (value === undefined) throw new Error('Missing path parameter: ' + name);
        return encodeURIComponent(serializeValue(value));
    });

/**
 * An array repeats its key, and an undefined or null field is left out.
 */
const buildSearchParams = (fields: Record<string, unknown>): URLSearchParams => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || value === null) continue;
        for (const item of Array.isArray(value) ? value : [value]) params.append(key, serializeValue(item));
    }
    return params;
};

const buildFormData = (fields: Record<string, unknown>): FormData => {
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) {
        for (const item of Array.isArray(value) ? value : [value]) {
            if (item instanceof Blob) formData.append(key, item);
            else if (item !== undefined && item !== null) formData.append(key, typeof item === 'string' ? item : JSON.stringify(item));
        }
    }
    return formData;
};

/**
 * A multipart body leaves Content-Type to fetch, which adds the boundary.
 */
const encodeBody = (route: GeneratedRoute, body: unknown, headers: Headers): BodyInit => {
    switch (route.contentType) {
        case 'multipart/form-data':
            return body instanceof FormData ? body : buildFormData(body as Record<string, unknown>);
        case 'application/x-www-form-urlencoded':
            if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/x-www-form-urlencoded');
            return buildSearchParams(body as Record<string, unknown>);
        default:
            if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
            return JSON.stringify(body);
    }
};

const parseJson = (text: string): unknown => {
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return text;
    }
};

/**
 * The words kizuna uses when a rule was given none. An app writes its own from
 * the code and the values beside it.
 */
const defaultMessage = (issue: ValidationIssueRecord): string => {
    switch (issue.code) {
        case 'required':
            return 'Required';
        case 'invalid_type':
            return 'Invalid input: expected ' + String(issue.expected);
        case 'too_short':
            return 'Too small: expected string to have >=' + String(issue.minimum) + ' characters';
        case 'too_long':
            return 'Too big: expected string to have <=' + String(issue.maximum) + ' characters';
        case 'wrong_length':
            return 'Invalid string: expected exactly ' + String(issue.length) + ' characters';
        case 'too_small':
            return 'Too small: expected number to be ' + (issue.inclusive ? '>=' : '>') + String(issue.minimum);
        case 'too_big':
            return 'Too big: expected number to be ' + (issue.inclusive ? '<=' : '<') + String(issue.maximum);
        case 'too_few':
            return 'Too small: expected array to have >=' + String(issue.minimum) + ' items';
        case 'too_many':
            return 'Too big: expected array to have <=' + String(issue.maximum) + ' items';
        case 'invalid_format':
            return 'Invalid ' + String(issue.format);
        case 'pattern_mismatch':
            return 'Invalid string: must match pattern ' + String(issue.pattern);
        case 'not_one_of':
            return 'Invalid option: expected one of ' + (issue.values as unknown[]).map((value) => JSON.stringify(value)).join('|');
        case 'not_multiple_of':
            return 'Invalid number: must be a multiple of ' + String(issue.divisor);
        case 'unknown_key':
            return 'Unrecognized key' + ((issue.keys as string[]).length === 1 ? '' : 's') + ': ' + (issue.keys as string[]).map((key) => JSON.stringify(key)).join(', ');
        default:
            return 'Invalid input';
    }
};

const issueOf = (node: RuleNode, code: string, path: string[], values: Record<string, unknown> = {}): ValidationIssueRecord => {
    const issue: ValidationIssueRecord = {
        code,
        path,
        message: '',
        ...values,
    };
    issue.message = node.messages[code] ?? defaultMessage(issue);
    return issue;
};

const patternCache = new Map<string, RegExp | null>();

/**
 * A pattern the engine cannot compile is left to the server.
 */
const compiledPattern = (source: string): RegExp | null => {
    const cached = patternCache.get(source);
    if (cached !== undefined) return cached;
    let compiled: RegExp | null;
    try {
        compiled = new RegExp(source, 'u');
    } catch {
        try {
            compiled = new RegExp(source);
        } catch {
            compiled = null;
        }
    }
    patternCache.set(source, compiled);
    return compiled;
};

/**
 * Zod's float-safe remainder, so 0.3 is not a multiple of 0.1.
 */
const isMultipleOf = (value: number, divisor: number): boolean => {
    const decimals = (candidate: number): number => {
        const text = candidate.toString();
        const index = text.indexOf('.');
        return index === -1 ? 0 : text.length - index - 1;
    };
    const scale = Math.pow(10, Math.max(decimals(value), decimals(divisor)));
    return (Math.round(value * scale) % Math.round(divisor * scale)) === 0;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Checks one value against one node, the way the server's schema would, and
 * adds what fails to issues.
 */
const checkNode = (node: RuleNode, value: unknown, path: string[], issues: ValidationIssueRecord[]): void => {
    if (value === undefined) {
        if (node.required) issues.push(issueOf(node, 'required', path));
        return;
    }
    if (value === null) {
        if (!node.nullable) issues.push(issueOf(node, 'invalid_type', path, { expected: node.kind === 'number' ? 'number' : node.kind }));
        return;
    }
    switch (node.kind) {
        case 'string': {
            if (typeof value !== 'string') {
                issues.push(issueOf(node, 'invalid_type', path, { expected: 'string' }));
                return;
            }
            if (node.length !== undefined && value.length !== node.length) {
                issues.push(issueOf(node, 'wrong_length', path, { length: node.length }));
            } else {
                if (node.minLength !== undefined && value.length < node.minLength) {
                    issues.push(issueOf(node, 'too_short', path, { minimum: node.minLength }));
                }
                if (node.maxLength !== undefined && value.length > node.maxLength) {
                    issues.push(issueOf(node, 'too_long', path, { maximum: node.maxLength }));
                }
            }
            if (node.pattern !== undefined) {
                const pattern = compiledPattern(node.pattern);
                if (pattern !== null && !pattern.test(value)) {
                    issues.push(
                        node.format !== undefined
                            ? issueOf(node, 'invalid_format', path, { format: node.format })
                            : issueOf(node, 'pattern_mismatch', path, { pattern: node.pattern })
                    );
                }
            }
            return;
        }
        case 'number': {
            if (typeof value !== 'number' || Number.isNaN(value)) {
                issues.push(issueOf(node, 'invalid_type', path, { expected: 'number' }));
                return;
            }
            if (node.integer && !Number.isInteger(value)) {
                issues.push(issueOf(node, 'invalid_type', path, { expected: 'int' }));
                return;
            }
            if (node.minimum !== undefined && value < node.minimum) {
                issues.push(issueOf(node, 'too_small', path, { minimum: node.minimum, inclusive: true }));
            }
            if (node.exclusiveMinimum !== undefined && value <= node.exclusiveMinimum) {
                issues.push(issueOf(node, 'too_small', path, { minimum: node.exclusiveMinimum, inclusive: false }));
            }
            if (node.maximum !== undefined && value > node.maximum) {
                issues.push(issueOf(node, 'too_big', path, { maximum: node.maximum, inclusive: true }));
            }
            if (node.exclusiveMaximum !== undefined && value >= node.exclusiveMaximum) {
                issues.push(issueOf(node, 'too_big', path, { maximum: node.exclusiveMaximum, inclusive: false }));
            }
            if (node.multipleOf !== undefined && !isMultipleOf(value, node.multipleOf)) {
                issues.push(issueOf(node, 'not_multiple_of', path, { divisor: node.multipleOf }));
            }
            return;
        }
        case 'boolean':
            if (typeof value !== 'boolean') issues.push(issueOf(node, 'invalid_type', path, { expected: 'boolean' }));
            return;
        case 'enum':
            if (!node.values.includes(value as string)) issues.push(issueOf(node, 'not_one_of', path, { values: node.values }));
            return;
        case 'array': {
            if (!Array.isArray(value)) {
                issues.push(issueOf(node, 'invalid_type', path, { expected: 'array' }));
                return;
            }
            value.forEach((item, index) => checkNode(node.items, item, [...path, String(index)], issues));
            if (node.minItems !== undefined && value.length < node.minItems) {
                issues.push(issueOf(node, 'too_few', path, { minimum: node.minItems }));
            }
            if (node.maxItems !== undefined && value.length > node.maxItems) {
                issues.push(issueOf(node, 'too_many', path, { maximum: node.maxItems }));
            }
            return;
        }
        case 'object': {
            if (!isRecord(value)) {
                issues.push(issueOf(node, 'invalid_type', path, { expected: 'object' }));
                return;
            }
            for (const [key, field] of Object.entries(node.fields)) checkNode(field, value[key], [...path, key], issues);
            if (node.strict) {
                const extra = Object.keys(value).filter((key) => !(key in node.fields));
                if (extra.length > 0) issues.push(issueOf(node, 'unknown_key', path, { keys: extra }));
            }
            return;
        }
        default:
            return;
    }
};

/**
 * What the server does to a path, query or header string before it checks
 * it: a number for a number, true or false for a boolean, otherwise as sent.
 */
const coerceScalar = (node: RuleNode, value: unknown): unknown => {
    if (typeof value !== 'string') return value;
    if (node.kind === 'number') {
        const parsed = Number(value);
        return Number.isNaN(parsed) ? value : parsed;
    }
    if (node.kind === 'boolean') {
        if (value === 'true') return true;
        if (value === 'false') return false;
    }
    return value;
};

const coerceFields = (node: RuleNode | undefined, input: unknown): unknown => {
    if (node === undefined || node.kind !== 'object' || !isRecord(input)) return input;
    const result: Record<string, unknown> = { ...input };
    for (const [key, field] of Object.entries(node.fields)) {
        const value = input[key];
        if (value === undefined) continue;
        if (field.kind === 'array') {
            result[key] = Array.isArray(value) ? value.map((item) => coerceScalar(field.items, item)) : coerceScalar(field.items, value);
        } else {
            result[key] = coerceScalar(field, value);
        }
    }
    return result;
};

const FORM_CONTENT_TYPES = new Set(['application/x-www-form-urlencoded', 'multipart/form-data']);

const STAGE_DETAILS = {
    params: 'Invalid path parameters',
    query: 'Invalid query parameters',
    headers: 'Invalid headers',
    body: 'Invalid request body',
};

/**
 * The query and header values as they go on the wire: strings, or arrays of
 * strings, with undefined and null left out.
 */
const wireFields = (fields: Record<string, unknown> | undefined): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields ?? {})) {
        if (value === undefined || value === null) continue;
        result[key] = Array.isArray(value) ? value.map(serializeValue) : serializeValue(value);
    }
    return result;
};

const lowerCaseKeys = (fields: Record<string, unknown>): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) result[key.toLowerCase()] = value;
    return result;
};

/**
 * Runs a request through the route's rules in the server's order, and
 * answers what the server would: the first failing part, or nothing.
 */
const checkRequest = (route: GeneratedRoute, args: CallArgs): ValidationProblem | undefined => {
    const rules = route.rules;
    if (rules === undefined) return undefined;
    const body = args.form !== undefined ? readFormData(args.form, rules.body) : args.body;
    const stages: Array<[keyof typeof STAGE_DETAILS, RuleNode | undefined, unknown]> = [
        ['params', rules.params, coerceFields(rules.params, wireFields(args.params))],
        ['query', rules.query, coerceFields(rules.query, wireFields(args.query))],
        ['headers', rules.headers, coerceFields(rules.headers, lowerCaseKeys(wireFields(args.headers)))],
        ['body', rules.body, route.contentType !== undefined && FORM_CONTENT_TYPES.has(route.contentType) ? coerceFields(rules.body, body) : body],
    ];
    for (const [stage, node, input] of stages) {
        if (node === undefined) continue;
        const issues: ValidationIssueRecord[] = [];
        checkNode(node, input, [], issues);
        if (issues.length > 0) {
            return {
                type: 'about:blank',
                title: 'Bad Request',
                status: 400,
                detail: STAGE_DETAILS[stage],
                errors: issues,
            };
        }
    }
    return undefined;
};

const attributesOf = (node: RuleNode): InputAttributes => {
    const attributes: InputAttributes = {};
    if (node.required && !node.nullable) attributes.required = true;
    switch (node.kind) {
        case 'string':
            if (node.format === 'email') {
                attributes.type = 'email';
                attributes.inputMode = 'email';
            } else if (node.format === 'uri' || node.format === 'url') {
                attributes.type = 'url';
                attributes.inputMode = 'url';
            }
            if (node.length !== undefined) {
                attributes.minLength = node.length;
                attributes.maxLength = node.length;
            }
            if (node.minLength !== undefined) attributes.minLength = node.minLength;
            if (node.maxLength !== undefined) attributes.maxLength = node.maxLength;
            if (node.pattern !== undefined && node.format === undefined) attributes.pattern = node.pattern;
            return attributes;
        case 'number':
            attributes.type = 'number';
            attributes.inputMode = node.integer ? 'numeric' : 'decimal';
            if (node.minimum !== undefined) attributes.min = node.minimum;
            if (node.exclusiveMinimum !== undefined && node.integer) attributes.min = node.exclusiveMinimum + 1;
            if (node.maximum !== undefined) attributes.max = node.maximum;
            if (node.exclusiveMaximum !== undefined && node.integer) attributes.max = node.exclusiveMaximum - 1;
            attributes.step = node.multipleOf ?? (node.integer ? 1 : 'any');
            return attributes;
        default:
            return attributes;
    }
};

/**
 * Wraps the rules the generator wrote with check and attributes, all the way
 * down.
 */
const buildRules = (node: RuleNode, coerce: boolean): FieldRules => {
    const built: Record<string, unknown> = {
        ...node,
        check: (value: unknown) => {
            const issues: ValidationIssueRecord[] = [];
            checkNode(node, coerce ? coerceScalar(node, value) : value, [], issues);
            return issues[0];
        },
        attributes: () => attributesOf(node),
    };
    if (node.kind === 'object') {
        const fields: Record<string, FieldRules> = {};
        for (const [key, field] of Object.entries(node.fields)) fields[key] = buildRules(field, coerce);
        built.fields = fields;
    }
    if (node.kind === 'array') built.items = buildRules(node.items, coerce);
    return built as unknown as FieldRules;
};

const buildRequestRules = (route: GeneratedRoute): Record<string, FieldRules> => {
    const rules = route.rules ?? {};
    const built: Record<string, FieldRules> = {};
    const formBody = route.contentType !== undefined && FORM_CONTENT_TYPES.has(route.contentType);
    if (rules.params) built.params = buildRules(rules.params, true);
    if (rules.query) built.query = buildRules(rules.query, true);
    if (rules.headers) built.headers = buildRules(rules.headers, true);
    if (rules.body) built.body = buildRules(rules.body, formBody);
    return built;
};

const UNSAFE_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * The segments of a form field name: dots for objects, brackets for indexes,
 * an empty bracket pair to append. 'members[0].email' is ['members', '0', 'email'].
 */
export const fieldPath = (name: string): string[] => {
    const segments: string[] = [];
    for (const part of name.split('.')) {
        const match = /^([^[\]]*)((?:\[[^\]]*\])*)$/.exec(part);
        if (match === null) {
            segments.push(part);
            continue;
        }
        if (match[1] !== '') segments.push(match[1]);
        for (const index of match[2].matchAll(/\[([^\]]*)\]/g)) segments.push(index[1]);
    }
    return segments;
};

/**
 * The form field name for a path: 'members[0].email' for ['members', '0', 'email'],
 * and '' for the request as a whole.
 */
export const fieldName = (path: string[]): string =>
    path.map((segment, index) => (/^\d+$/.test(segment) ? '[' + segment + ']' : index === 0 ? segment : '.' + segment)).join('');

const assignField = (root: Record<string, unknown>, segments: string[], value: unknown): void => {
    let container: Record<string, unknown> | unknown[] = root;
    for (let index = 0; index < segments.length; index += 1) {
        const segment = segments[index];
        if (UNSAFE_SEGMENTS.has(segment)) return;
        const last = index === segments.length - 1;
        const key = Array.isArray(container) ? (segment === '' ? container.length : Number(segment)) : segment;
        if (last) {
            const existing = (container as Record<string | number, unknown>)[key];
            if (segment === '' || existing === undefined) {
                (container as Record<string | number, unknown>)[key] = value;
            } else if (Array.isArray(existing)) {
                existing.push(value);
            } else {
                (container as Record<string | number, unknown>)[key] = [existing, value];
            }
            return;
        }
        const next = segments[index + 1];
        let child = (container as Record<string | number, unknown>)[key];
        if (child === undefined || typeof child !== 'object' || child === null) {
            child = next === '' || /^\d+$/.test(next) ? [] : {};
            (container as Record<string | number, unknown>)[key] = child;
        }
        container = child as Record<string, unknown> | unknown[];
    }
};

/**
 * Converts what a form sends, all strings, to what the field's rules expect,
 * and drops an empty field that is not a string so an optional number stays
 * absent.
 */
const coerceForm = (node: RuleNode | undefined, value: unknown): unknown => {
    if (node === undefined) return value;
    if (typeof value === 'string' && value === '' && node.kind !== 'string') return undefined;
    switch (node.kind) {
        case 'number':
            return coerceScalar(node, value);
        case 'boolean':
            if (value === 'true' || value === 'on') return true;
            if (value === 'false') return false;
            return value;
        case 'array': {
            const items = Array.isArray(value) ? value : [value];
            return items.map((item) => coerceForm(node.items, item)).filter((item) => item !== undefined);
        }
        case 'object': {
            if (!isRecord(value)) return value;
            const result: Record<string, unknown> = {};
            for (const [key, item] of Object.entries(value)) {
                const converted = coerceForm(node.fields[key], item);
                if (converted !== undefined) result[key] = converted;
            }
            return result;
        }
        default:
            return value;
    }
};

/**
 * Reads a form into the body a route expects. Field names use dots for
 * objects and brackets for indexes, and a field's rules decide what its
 * string becomes.
 */
export const readFormData = (form: FormData, rules?: FieldRules | RuleNode): Record<string, unknown> => {
    const root: Record<string, unknown> = {};
    form.forEach((value, name) => {
        assignField(root, fieldPath(name), value);
    });
    const converted = coerceForm(rules as RuleNode | undefined, root);
    return isRecord(converted) ? converted : root;
};

const errorsOf = (result: unknown): ValidationIssueRecord[] => {
    if (!isRecord(result)) return [];
    const body = isRecord(result.body) ? result.body : result;
    return Array.isArray(body.errors) ? (body.errors as ValidationIssueRecord[]) : [];
};

/**
 * Every issue on one field, whichever status carried it: the 400, a declared
 * 409, or what check returned.
 */
export const readFieldIssues = (result: unknown, name: string): ValidationIssueRecord[] =>
    errorsOf(result).filter((issue) => fieldName(issue.path) === name);

/**
 * The first issue on one field, or nothing.
 */
export const readFieldIssue = (result: unknown, name: string): ValidationIssueRecord | undefined => readFieldIssues(result, name)[0];

/**
 * The message of the first issue on one field, or nothing.
 */
export const readFieldError = (result: unknown, name: string): string | undefined => readFieldIssue(result, name)?.message;

/**
 * Every message, keyed by field name. The request as a whole is ''.
 */
export const fieldErrors = (result: unknown): Record<string, string[]> => {
    const errors: Record<string, string[]> = {};
    for (const issue of errorsOf(result)) {
        const name = fieldName(issue.path);
        (errors[name] ??= []).push(issue.message);
    }
    return errors;
};

interface ServerSentEvent {
    event?: string;
    data: unknown;
    id?: string;
    retry?: number;
}

/**
 * A lone carriage return at the end may be half of CRLF, so it waits for more
 * unless the stream is over.
 */
const findLineEnd = (buffer: string, final: boolean): { index: number; length: number } | undefined => {
    for (let index = 0; index < buffer.length; index += 1) {
        const character = buffer[index];
        if (character === '\n') return { index, length: 1 };
        if (character === '\r') {
            if (index + 1 < buffer.length) return { index, length: buffer[index + 1] === '\n' ? 2 : 1 };
            if (final) return { index, length: 1 };
            return undefined;
        }
    }
    return undefined;
};

/**
 * Reads text/event-stream as the WHATWG HTML specification parses it.
 */
async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ServerSentEvent> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let first = true;
    let dataLines: string[] = [];
    let eventType = '';
    let lastEventId = '';
    let retry: number | undefined;

    const dispatch = (): ServerSentEvent | undefined => {
        if (dataLines.length === 0) {
            eventType = '';
            return undefined;
        }
        const message: ServerSentEvent = {
            data: parseJson(dataLines.join('\n')),
        };
        if (eventType !== '') message.event = eventType;
        if (lastEventId !== '') message.id = lastEventId;
        if (retry !== undefined) message.retry = retry;
        dataLines = [];
        eventType = '';
        retry = undefined;
        return message;
    };

    const processLine = (line: string): ServerSentEvent | undefined => {
        if (line === '') return dispatch();
        if (line.startsWith(':')) return undefined;
        const separator = line.indexOf(':');
        const field = separator === -1 ? line : line.slice(0, separator);
        let value = separator === -1 ? '' : line.slice(separator + 1);
        if (value.startsWith(' ')) value = value.slice(1);
        switch (field) {
            case 'event':
                eventType = value;
                break;
            case 'data':
                dataLines.push(value);
                break;
            case 'id':
                if (!value.includes('\0')) lastEventId = value;
                break;
            case 'retry':
                if (/^\d+$/.test(value)) retry = Number(value);
                break;
        }
        return undefined;
    };

    try {
        for (;;) {
            const { done, value } = await reader.read();
            let chunk = done ? decoder.decode() : decoder.decode(value, { stream: true });
            if (first && chunk.length > 0) {
                if (chunk.charCodeAt(0) === 0xfeff) chunk = chunk.slice(1);
                first = false;
            }
            buffer += chunk;
            for (;;) {
                const lineEnd = findLineEnd(buffer, done);
                if (lineEnd === undefined) break;
                const line = buffer.slice(0, lineEnd.index);
                buffer = buffer.slice(lineEnd.index + lineEnd.length);
                const message = processLine(line);
                if (message !== undefined) yield message;
            }
            if (done) return;
        }
    } finally {
        void reader.cancel().catch(() => undefined);
    }
}

async function* readText(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) {
                const tail = decoder.decode();
                if (tail.length > 0) yield tail;
                return;
            }
            const text = decoder.decode(value, { stream: true });
            if (text.length > 0) yield text;
        }
    } finally {
        void reader.cancel().catch(() => undefined);
    }
}

async function* readBytes(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
    const reader = body.getReader();
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) return;
            yield value;
        }
    } finally {
        void reader.cancel().catch(() => undefined);
    }
}

const readStream = (body: ReadableStream<Uint8Array>, contentType: string): AsyncIterable<unknown> => {
    const essence = (contentType.split(';')[0] ?? '').trim().toLowerCase();
    if (essence === 'text/event-stream') return readEvents(body);
    if (essence.startsWith('text/')) return readText(body);
    return readBytes(body);
};

const buildMethod = (route: GeneratedRoute, config: ClientConfig) => {
    const call = async (args: CallArgs = {}) => {
        const query = args.query === undefined ? '' : buildSearchParams(args.query).toString();
        const url = config.baseUrl + buildPath(route.path, args.params) + (query.length > 0 ? '?' + query : '');
        const headers = new Headers(config.baseHeaders);
        for (const [name, value] of Object.entries(args.headers ?? {})) {
            if (value !== undefined) headers.set(name, value);
        }
        const init: RequestInit = {
            method: route.method,
            headers,
        };
        // A form is read into the body the route expects; the route's rules say what each string becomes.
        const body = args.form !== undefined ? readFormData(args.form, route.rules?.body) : args.body;
        if (body !== undefined) init.body = encodeBody(route, body, headers);
        if (config.credentials !== undefined) init.credentials = config.credentials;
        await config.onRequest?.({
            url,
            method: route.method,
            headers,
            route,
        });

        const response = await (config.fetch ?? fetch)(url, {
            ...init,
            ...args.fetchOptions,
        });
        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, name) => {
            responseHeaders[name] = value;
        });
        const declared = route.responses[response.status];
        if (declared !== undefined && 'stream' in declared && response.body !== null) {
            return {
                status: response.status,
                body: readStream(response.body, declared.contentType),
                headers: responseHeaders,
            };
        }
        const text = await response.text();
        return {
            status: response.status,
            body: text.length > 0 ? parseJson(text) : undefined,
            headers: responseHeaders,
        };
    };
    const streams = Object.values(route.responses).some((response) => 'stream' in response);
    Object.defineProperty(call, '~route', {
        value: {
            ...route,
            streams,
        },
    });
    if (route.rules !== undefined) {
        Object.defineProperty(call, 'check', {
            value: (args: CallArgs = {}) => checkRequest(route, args),
        });
        Object.defineProperty(call, 'rules', {
            value: buildRequestRules(route),
        });
    }
    return call;
};

const isRoute = (node: GeneratedRoutes | GeneratedRoute): node is GeneratedRoute => typeof node['method'] === 'string';

const buildTree = (routes: GeneratedRoutes, config: ClientConfig): Record<string, unknown> => {
    const tree: Record<string, unknown> = {};
    for (const [key, node] of Object.entries(routes)) {
        tree[key] = isRoute(node) ? buildMethod(node, config) : buildTree(node, config);
    }
    return tree;
};

/**
 * Sends the request context headers with every request. An explicit
 * baseHeaders entry wins.
 */
const buildClient = (routes: GeneratedRoutes, config: ClientConfig & { requestContext?: object }): Record<string, unknown> => {
    const contextHeaders: Record<string, string> = {};
    for (const [name, value] of Object.entries(config.requestContext ?? {})) {
        if (value !== undefined) contextHeaders[name] = String(value);
    }
    return buildTree(routes, {
        ...config,
        baseHeaders: {
            ...contextHeaders,
            ...config.baseHeaders,
        },
    });
};
`;
