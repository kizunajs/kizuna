import { z } from 'zod';

/**
 * The person's answer to a call that needs approval, for a route's body.
 *
 * @example
 * ```ts
 * body: z.object({
 *     prompt: z.string(),
 *     answer: ToolAnswerSchema.optional(),
 * }),
 * ```
 */
export const ToolAnswerSchema = z.object({
    call: z.object({
        id: z.string(),
        name: z.string(),
        input: z.unknown().optional(),
    }),
    approved: z.boolean(),
});
