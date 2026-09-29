import type { $input, $output } from 'zod/v4/core';

declare module 'zod/v4/core' {
    interface GlobalMeta {
        /**
         * The brand generated clients give this schema's values. Set by
         * `Kizuna.brand`.
         */
        brand?: string;
        /**
         * Deprecates the schema. Pass a message to tell callers what to use
         * instead.
         */
        deprecated?: boolean | string;
        /**
         * An example value, or an array of them. Emitted as JSON Schema
         * `examples`.
         *
         * @example
         * const email = z.email().meta({
         *     example: 'ada@example.com',
         * });
         */
        example?: $input | $output | Array<$input | $output>;
    }
}

export {};
