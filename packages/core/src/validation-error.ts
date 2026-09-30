import { z } from 'zod';
import { createModel } from './model.js';
import { ProblemDetailsSchema } from './error-response.js';
import type { ProblemDetails } from './problem-details.js';

/**
 * Every code kizuna sends in `errors[].code`. One code per thing that can go
 * wrong, so an app's `switch` never needs a qualifier, and a Zod rename never
 * reaches the wire.
 */
export const BUILTIN_VALIDATION_ISSUE_CODES = [
    'required',
    'invalid_type',
    'too_short',
    'too_long',
    'wrong_length',
    'too_small',
    'too_big',
    'too_few',
    'too_many',
    'invalid_format',
    'pattern_mismatch',
    'not_one_of',
    'not_multiple_of',
    'unknown_key',
    'invalid_json',
    'invalid',
] as const;

/**
 * One of kizuna's own issue codes, with no escape hatch for arbitrary strings.
 * `k.issue` accepts this union plus the codes declared under `validation.issueCodes`.
 */
export type BuiltinIssueCode = (typeof BUILTIN_VALIDATION_ISSUE_CODES)[number];

/**
 * Machine-readable error classification.
 *
 * Built-in codes are offered as autocomplete suggestions, while any custom
 * string remains assignable, the `string & {}` branch keeps the literal
 * suggestions from collapsing into a bare `string`. Emit codes with `k.issue`,
 * which is narrower.
 */
export type ValidationIssueCode = BuiltinIssueCode | (string & {});

/**
 * A value an enum or literal rule accepts, as it appears in `not_one_of`.
 */
export type IssueLiteral = string | number | boolean | null;

/**
 * The type of one value a built-in code carries, for the generators that
 * emit a typed issue per language.
 */
export type IssueFieldType = 'number' | 'boolean' | 'string' | 'string[]' | 'literal[]';

/**
 * The values each built-in code carries, flat on the issue beside `code`,
 * `path` and `message`. The generators read this to emit one typed case per
 * code.
 */
export const VALIDATION_ISSUE_FIELDS: Record<BuiltinIssueCode, Record<string, IssueFieldType>> = {
    required: {},
    invalid_type: {
        expected: 'string',
    },
    too_short: {
        minimum: 'number',
    },
    too_long: {
        maximum: 'number',
    },
    wrong_length: {
        length: 'number',
    },
    too_small: {
        minimum: 'number',
        inclusive: 'boolean',
    },
    too_big: {
        maximum: 'number',
        inclusive: 'boolean',
    },
    too_few: {
        minimum: 'number',
    },
    too_many: {
        maximum: 'number',
    },
    invalid_format: {
        format: 'string',
    },
    pattern_mismatch: {
        pattern: 'string',
    },
    not_one_of: {
        values: 'literal[]',
    },
    not_multiple_of: {
        divisor: 'number',
    },
    unknown_key: {
        keys: 'string[]',
    },
    invalid_json: {},
    invalid: {},
};

interface IssueBase {
    /**
     * Segments to the invalid field, as strings: `["members", "0", "email"]`.
     * Empty for the request as a whole.
     */
    path: string[];
    /**
     * Developer-facing description of the failure: the rule's own message
     * when it has one, otherwise kizuna's default. The app writes the words
     * it shows from `code` and the values beside it.
     */
    message: string;
}

/**
 * One failed rule, typed by its code, with the rule's values beside it.
 */
export type BuiltinValidationIssue =
    | (IssueBase & { code: 'required' })
    | (IssueBase & { code: 'invalid_type'; expected: string })
    | (IssueBase & { code: 'too_short'; minimum: number })
    | (IssueBase & { code: 'too_long'; maximum: number })
    | (IssueBase & { code: 'wrong_length'; length: number })
    | (IssueBase & { code: 'too_small'; minimum: number; inclusive: boolean })
    | (IssueBase & { code: 'too_big'; maximum: number; inclusive: boolean })
    | (IssueBase & { code: 'too_few'; minimum: number })
    | (IssueBase & { code: 'too_many'; maximum: number })
    | (IssueBase & { code: 'invalid_format'; format: string })
    | (IssueBase & { code: 'pattern_mismatch'; pattern: string })
    | (IssueBase & { code: 'not_one_of'; values: IssueLiteral[] })
    | (IssueBase & { code: 'not_multiple_of'; divisor: number })
    | (IssueBase & { code: 'unknown_key'; keys: string[] })
    | (IssueBase & { code: 'invalid_json' })
    | (IssueBase & { code: 'invalid' });

/**
 * An issue carrying a code the API declared under `validation.issueCodes`,
 * with the `params` given to `k.issue` or `throwValidationError` flat beside it.
 */
export type CustomValidationIssue<Codes extends string = string> = IssueBase & {
    code: Codes;
} & {
    [param: string]: unknown;
};

/**
 * One entry of `errors[]`: a built-in issue, or a custom one when the API
 * declares `Codes`.
 */
export type ValidationIssue<Codes extends string = never> =
    | BuiltinValidationIssue
    | ([Codes] extends [never] ? never : CustomValidationIssue<Codes>);

/**
 * RFC 9457 Problem Details with one entry per failed rule. Every 400 kizuna
 * sends has this shape, and a route that declares `409: ValidationErrorSchema`
 * answers a conflict with it too.
 */
export interface ValidationError<Codes extends string = never> extends ProblemDetails {
    errors: ValidationIssue<Codes>[];
}

const IssueLiteralSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/**
 * One failed rule on the wire. Loose, so the params of a declared code pass
 * through beside the built-in values.
 */
export const ValidationIssueSchema = z.looseObject({
    /**
     * Machine-readable classification: one of kizuna's built-in codes, or one
     * the API declared under `validation.issueCodes`.
     */
    code: z.string(),
    /**
     * Segments to the invalid field (e.g. `["address", "zip"]`).
     */
    path: z.array(z.string()),
    /**
     * Developer-facing description of the failure.
     */
    message: z.string(),
    expected: z.string().optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    inclusive: z.boolean().optional(),
    length: z.number().optional(),
    format: z.string().optional(),
    pattern: z.string().optional(),
    values: z.array(IssueLiteralSchema).optional(),
    divisor: z.number().optional(),
    keys: z.array(z.string()).optional(),
});

/**
 * RFC 9457 Problem Details error response for validation failures.
 *
 * Extends the base Problem Details shape with an `errors` extension member
 * listing each failed rule. Kizuna sends it on every 400. A route declares it
 * on a 409 to answer a conflict a handler finds, the same way:
 *
 * ```ts
 * import { ValidationErrorSchema } from 'kizunajs/schemas';
 *
 * createUser: k
 *     .route({
 *         method: 'POST',
 *         path: '/users',
 *         body: CreateUserSchema,
 *         responses: {
 *             201: UserSchema,
 *             409: ValidationErrorSchema,
 *         },
 *     })
 *     .handler(async ({ body, throwError }) => {
 *         if (await db.users.exists(body.email)) {
 *             throwError({
 *                 status: 409,
 *                 body: {
 *                     detail: 'Email already registered',
 *                     errors: [
 *                         {
 *                             code: 'already_exists',
 *                             path: ['email'],
 *                             message: 'Email already registered',
 *                         },
 *                     ],
 *                 },
 *             });
 *         }
 *     }),
 * ```
 */
export const ValidationErrorSchema = createModel({
    title: 'ValidationError',
    description: 'RFC 9457 Problem Details error response for validation failures.',
    schema: ProblemDetailsSchema.extend({
        /**
         * One entry per failed rule.
         */
        errors: z.array(ValidationIssueSchema),
    }),
});

/**
 * The issue a handler hands `throwValidationError`. `params` land flat on the
 * wire beside `code`, `path` and `message`.
 */
export interface HandlerIssue {
    code: ValidationIssueCode;
    path: string[];
    message: string;
    params?: Record<string, unknown>;
}

const RESERVED_ISSUE_KEYS = new Set(['code', 'path', 'message']);

const flattenParams = (params: unknown): Record<string, unknown> => {
    if (params === null || typeof params !== 'object') return {};
    const flat: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
        if (!RESERVED_ISSUE_KEYS.has(key)) flat[key] = value;
    }
    return flat;
};

/**
 * What a handler raised with `throwValidationError`, caught by the adapter and
 * rendered as the 400.
 */
export class HandlerValidationError extends Error {
    readonly issues: ValidationIssue<string>[];

    constructor(issues: HandlerIssue[]) {
        super(issues[0]?.message ?? 'Invalid request');
        this.name = 'HandlerValidationError';
        this.issues = issues.map((issue) => ({
            ...flattenParams(issue.params),
            code: issue.code,
            path: issue.path,
            message: issue.message,
        }));
    }
}

/**
 * The source of a regex Zod reports as `/^\d{4}$/`, in the form JSON Schema
 * and the OpenAPI document already use: `^\d{4}$`.
 */
const regexSource = (pattern: unknown): string => {
    const text = String(pattern);
    const match = /^\/([\s\S]*)\/[a-z]*$/.exec(text);
    return match?.[1] ?? text;
};

const numberOf = (value: unknown): number => (typeof value === 'bigint' ? Number(value) : Number(value));

/**
 * Maps one Zod issue to kizuna's vocabulary. A code Zod does not own came
 * from `k.issue`, and passes through with its params.
 */
export const toValidationIssue = (issue: z.core.$ZodIssue): ValidationIssue<string> => {
    const raw = issue as unknown as Record<string, unknown>;
    const path = issue.path.map(String);
    const message = issue.message;

    switch (issue.code) {
        case 'invalid_type':
            // Zod names the input only when asked (`reportInput`); a present key holding `undefined` is a missing field.
            if ('input' in raw && raw.input === undefined) {
                return {
                    code: 'required',
                    path,
                    message,
                };
            }
            return {
                code: 'invalid_type',
                path,
                message,
                expected: String(raw.expected),
            };
        case 'too_small': {
            const minimum = numberOf(raw.minimum);
            if (raw.origin === 'string') {
                return raw.exact === true
                    ? {
                          code: 'wrong_length',
                          path,
                          message,
                          length: minimum,
                      }
                    : {
                          code: 'too_short',
                          path,
                          message,
                          minimum,
                      };
            }
            if (raw.origin === 'array' || raw.origin === 'set') {
                return {
                    code: 'too_few',
                    path,
                    message,
                    minimum,
                };
            }
            return {
                code: 'too_small',
                path,
                message,
                minimum,
                inclusive: raw.inclusive !== false,
            };
        }
        case 'too_big': {
            const maximum = numberOf(raw.maximum);
            if (raw.origin === 'string') {
                return raw.exact === true
                    ? {
                          code: 'wrong_length',
                          path,
                          message,
                          length: maximum,
                      }
                    : {
                          code: 'too_long',
                          path,
                          message,
                          maximum,
                      };
            }
            if (raw.origin === 'array' || raw.origin === 'set') {
                return {
                    code: 'too_many',
                    path,
                    message,
                    maximum,
                };
            }
            return {
                code: 'too_big',
                path,
                message,
                maximum,
                inclusive: raw.inclusive !== false,
            };
        }
        case 'invalid_format':
            if (raw.format === 'regex') {
                return {
                    code: 'pattern_mismatch',
                    path,
                    message,
                    pattern: regexSource(raw.pattern),
                };
            }
            return {
                code: 'invalid_format',
                path,
                message,
                format: String(raw.format),
            };
        case 'not_multiple_of':
            return {
                code: 'not_multiple_of',
                path,
                message,
                divisor: numberOf(raw.divisor),
            };
        case 'unrecognized_keys':
            return {
                code: 'unknown_key',
                path,
                message,
                keys: Array.isArray(raw.keys) ? raw.keys.map(String) : [],
            };
        case 'invalid_value':
            return {
                code: 'not_one_of',
                path,
                message,
                values: Array.isArray(raw.values) ? (raw.values as IssueLiteral[]) : [],
            };
        case 'custom':
            return {
                ...flattenParams(raw.params),
                code: 'invalid',
                path,
                message,
            };
        case 'invalid_union':
        case 'invalid_key':
        case 'invalid_element':
            return {
                code: 'invalid',
                path,
                message,
            };
        default:
            return {
                ...flattenParams(raw.params),
                code: String(raw.code),
                path,
                message,
            };
    }
};

export const toValidationIssues = (issues: z.core.$ZodIssue[]): ValidationIssue<string>[] => issues.map(toValidationIssue);
