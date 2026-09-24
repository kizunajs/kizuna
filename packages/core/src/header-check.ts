import type { z } from 'zod';

type HeaderScalar = string | number | boolean | bigint;

/**
 * A repeated request header arrives as a list, so it may be an array of
 * scalars. A `Date` is coerced from its string form.
 */
type IsRequestHeaderValue<Value> = unknown extends Value
    ? true
    : NonNullable<Value> extends HeaderScalar | Date
      ? true
      : NonNullable<Value> extends readonly (infer Element)[]
        ? NonNullable<Element> extends HeaderScalar | Date
            ? true
            : false
        : false;

/**
 * A client reads a response header back into one of these, so a date or a
 * list has no type to arrive as.
 */
type IsResponseHeaderValue<Value> = unknown extends Value ? true : NonNullable<Value> extends HeaderScalar ? true : false;

type InvalidRequestHeader<Schema> = Schema extends z.ZodType
    ? string extends keyof z.input<Schema>
        ? never
        : {
              [Key in keyof z.input<Schema>]-?: IsRequestHeaderValue<z.input<Schema>[Key]> extends true ? never : Key & string;
          }[keyof z.input<Schema>]
    : never;

type InvalidResponseHeader<Schema> = Schema extends z.ZodType
    ? string extends keyof z.input<Schema>
        ? never
        : {
              [Key in keyof z.input<Schema>]-?: IsResponseHeaderValue<z.input<Schema>[Key]> extends true ? never : Key & string;
          }[keyof z.input<Schema>]
    : never;

type RequestHeadersCheck<Definition> = Definition extends {
    headers: infer Schema;
}
    ? [InvalidRequestHeader<Schema>] extends [never]
        ? unknown
        : {
              headers: `kizuna: request header "${InvalidRequestHeader<Schema>}" holds one value, so it cannot be an object`;
          }
    : unknown;

type ResponseHeadersShape<Responses> = {
    [Status in keyof Responses]: Responses[Status] extends {
        headers: infer Schema;
    }
        ? [InvalidResponseHeader<Schema>] extends [never]
            ? unknown
            : {
                  headers: `kizuna: response header "${InvalidResponseHeader<Schema>}" must be a string, number, boolean, bigint, or enum`;
              }
        : unknown;
};

type InvalidResponseHeaders<Responses> = {
    [Status in keyof Responses]: Responses[Status] extends {
        headers: infer Schema;
    }
        ? InvalidResponseHeader<Schema>
        : never;
}[keyof Responses];

type ResponseHeadersCheck<Definition> = Definition extends {
    responses: infer Responses;
}
    ? [InvalidResponseHeaders<Responses>] extends [never]
        ? unknown
        : {
              responses: ResponseHeadersShape<Responses>;
          }
    : unknown;

/**
 * Reports header fields no request or client can carry. Intersect it with the
 * inferred definition: a route whose headers are all scalar gives `unknown`,
 * and an offending `headers` schema resolves to an error message naming the
 * header. `k.routes` throws for the same routes at runtime, which also catches
 * a datetime string.
 */
export type RouteHeadersCheck<Definition> = RequestHeadersCheck<Definition> & ResponseHeadersCheck<Definition>;
