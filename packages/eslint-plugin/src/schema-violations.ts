import ts from 'typescript';

/**
 * Resolves an identifier appearing inside a schema to the expression it was defined as
 * (a `const`'s initializer), following it across files. Backed by the TS type checker.
 */
export type SchemaResolver = (identifier: ts.Identifier) => ts.Expression | undefined;

/**
 * The ways a kizuna schema can be illegal: `coerce` (uses `z.coerce`),
 * `collection` (`z.set` or `z.map`), `union` (a union of objects with no
 * discriminator), and `transform` (a transform on a response body).
 */
export type SchemaIssue = 'coerce' | 'collection' | 'union' | 'transform';

/**
 * Which way a schema travels, since a transform is only unreadable on the way out.
 */
export type SchemaPosition = 'request' | 'response';

/**
 * An issue and the exact node that carries it, the `z.coerce` access or the offending
 * field. `viaReference` is true when it was reached by following an identifier to a named
 * schema, so the caller reports it on the reference rather than the (possibly remote) node.
 */
export interface SchemaViolation {
    issue: SchemaIssue;
    node: ts.Node;
    viaReference: boolean;
}

/**
 * Walks a schema expression, following `z.object` shapes, nested objects, and identifier
 * references to other schemas (across files), and returns every issue it carries, each
 * paired with the node it sits on. The walk is bounded by a visited set so cycles end.
 */
const OBJECT_FACTORIES = new Set(['object', 'strictObject', 'looseObject']);

/**
 * A call to `z.<name>(...)`, which is how every schema in this repo is spelled.
 */
const zodCall = (node: ts.Node, name: string): ts.CallExpression | undefined => {
    if (!ts.isCallExpression(node)) return undefined;
    const callee = node.expression;
    const matches =
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === 'z' &&
        callee.name.text === name;
    return matches ? node : undefined;
};

/**
 * Whether a union option is an object, following identifiers, `Kizuna.model`
 * and `.extend()` to whatever declared it.
 */
const resolvesToObject = (node: ts.Node, resolve: SchemaResolver, depth = 0): boolean => {
    if (depth > 8) return false;

    if (ts.isCallExpression(node)) {
        const callee = node.expression;
        if (ts.isPropertyAccessExpression(callee)) {
            if (ts.isIdentifier(callee.expression) && callee.expression.text === 'z' && OBJECT_FACTORIES.has(callee.name.text)) return true;
            if (callee.name.text === 'extend') return resolvesToObject(callee.expression, resolve, depth + 1);
            if (callee.name.text === 'model') {
                const [declaration] = node.arguments;
                if (declaration && ts.isObjectLiteralExpression(declaration)) {
                    for (const property of declaration.properties) {
                        if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === 'schema')
                            return resolvesToObject(property.initializer, resolve, depth + 1);
                    }
                }
            }
        }
    }

    if (ts.isIdentifier(node)) {
        const target = resolve(node);
        return target !== undefined && resolvesToObject(target, resolve, depth + 1);
    }

    return false;
};

export const collectSchemaIssues = (root: ts.Node, resolve: SchemaResolver, position: SchemaPosition = 'request'): SchemaViolation[] => {
    const violations: SchemaViolation[] = [];
    const reported = new Set<string>();
    const visited = new Set<ts.Node>();

    const add = (issue: SchemaIssue, node: ts.Node, viaReference: boolean): void => {
        const key = `${issue}@${node.getSourceFile().fileName}:${node.pos}`;
        if (reported.has(key)) return;
        reported.add(key);
        violations.push({ issue, node, viaReference });
    };

    const walk = (node: ts.Node, viaReference: boolean): void => {
        if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'z') {
            if (node.name.text === 'coerce') add('coerce', node, viaReference);
            if (node.name.text === 'set' || node.name.text === 'map') add('collection', node, viaReference);
        }

        // A predicate's return type is unknowable, so no generator can name what a response sends.
        if (position === 'response' && ts.isPropertyAccessExpression(node) && node.name.text === 'transform') {
            add('transform', node, viaReference);
        }

        const union = zodCall(node, 'union');
        const [options] = union?.arguments ?? [];
        if (
            options &&
            ts.isArrayLiteralExpression(options) &&
            options.elements.length > 1 &&
            options.elements.every((element) => resolvesToObject(element, resolve))
        ) {
            add('union', union!.expression, viaReference);
        }

        if (ts.isIdentifier(node)) {
            const target = resolve(node);
            if (target && !visited.has(target)) {
                visited.add(target);
                walk(target, true);
            }
        }

        ts.forEachChild(node, (child) => walk(child, viaReference));
    };

    visited.add(root);
    walk(root, false);
    return violations;
};
