import type { ToolDefinition, ToolHandlerFor } from './tools.js';

/**
 * A tool and the handler that answers it.
 */
export type ToolWithHandler<Definition extends ToolDefinition> = Definition & {
    handler: ToolHandlerFor<Definition>;
};

/**
 * What `k.tool` returns: the tool, waiting for its handler.
 */
export interface ToolBuilder<Definition extends ToolDefinition> {
    /**
     * The handler that answers this tool. `input` is typed from the tool's
     * schema, and the return is checked against its `output`.
     */
    handler(fn: ToolHandlerFor<Definition>): ToolWithHandler<Definition>;
}

export const createTool = <const Definition extends ToolDefinition>(definition: Definition): ToolBuilder<Definition> => ({
    handler: (fn) => ({
        ...definition,
        handler: fn,
    }),
});
