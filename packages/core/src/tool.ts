import type { ToolDefinition, ToolHandlerFor } from './tools.js';
import { DECLARATION, HANDLER } from './types.js';

/**
 * A tool and the handler that answers it.
 */
export type ToolWithHandler<Definition extends ToolDefinition> = Definition & {
    readonly [HANDLER]: ToolHandlerFor<Definition>;
};

/**
 * What `k.tool` returns: the tool itself, and the `handler` that answers it. A
 * tool nothing answers, one a generator reads, needs no handler.
 */
export type ToolBuilder<Definition extends ToolDefinition> = Definition & ToolHandlerStep<Definition>;

interface ToolHandlerStep<Definition extends ToolDefinition> {
    /**
     * The handler that answers this tool. `input` is typed from the tool's
     * schema, and the return is checked against its `output`.
     */
    handler(fn: ToolHandlerFor<Definition>): ToolWithHandler<Definition>;
}

export const createTool = <const Definition extends ToolDefinition>(definition: Definition): ToolBuilder<Definition> =>
    ({
        ...definition,
        handler: (fn: unknown) => ({
            ...definition,
            [HANDLER]: fn,
            [DECLARATION]: 'tool' as const,
        }),
    }) as unknown as ToolBuilder<Definition>;
