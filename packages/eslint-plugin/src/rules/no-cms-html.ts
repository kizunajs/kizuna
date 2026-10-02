import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import type { Scope } from '@typescript-eslint/utils/ts-eslint';

const createRule = ESLintUtils.RuleCreator((name) => `https://kizunajs.com/docs/eslint#${name}`);

type MessageIds = 'cmsHtml';

/**
 * Whether an expression is `<something>.pages.<name>.get()`, awaited or not.
 */
const readsCmsPage = (node: TSESTree.Node | null | undefined): boolean => {
    if (!node) return false;
    if (node.type === 'AwaitExpression') return readsCmsPage(node.argument);
    if (node.type !== 'CallExpression' || node.callee.type !== 'MemberExpression') return false;
    const callee = node.callee;
    if (callee.property.type !== 'Identifier' || callee.property.name !== 'get') return false;
    const page = callee.object;
    if (page.type !== 'MemberExpression') return false;
    const pages = page.object;
    return pages.type === 'MemberExpression' && pages.property.type === 'Identifier' && pages.property.name === 'pages';
};

const mentionsOutput = (node: TSESTree.Node | undefined): boolean => {
    if (!node) return false;
    if (node.type === 'TSTypeReference' && node.typeName.type === 'Identifier' && node.typeName.name === 'Output') return true;
    for (const [key, value] of Object.entries(node)) {
        if (key === 'parent') continue;
        if (Array.isArray(value)) {
            if (value.some((child) => child && typeof child === 'object' && 'type' in child && mentionsOutput(child as TSESTree.Node)))
                return true;
        } else if (value && typeof value === 'object' && 'type' in value && mentionsOutput(value as TSESTree.Node)) {
            return true;
        }
    }
    return false;
};

/**
 * The identifiers an expression reads, so `page.body` and `hero.text.trim()`
 * both lead back to `page` and `hero`.
 */
const rootIdentifiers = (node: TSESTree.Node): TSESTree.Identifier[] => {
    switch (node.type) {
        case 'Identifier':
            return [node];
        case 'MemberExpression':
            return rootIdentifiers(node.object);
        case 'CallExpression':
            return [...rootIdentifiers(node.callee), ...node.arguments.flatMap((argument) => rootIdentifiers(argument))];
        case 'ChainExpression':
            return rootIdentifiers(node.expression);
        case 'TemplateLiteral':
            return node.expressions.flatMap((expression) => rootIdentifiers(expression));
        case 'BinaryExpression':
        case 'LogicalExpression':
            return [...rootIdentifiers(node.left), ...rootIdentifiers(node.right)];
        case 'ConditionalExpression':
            return [...rootIdentifiers(node.consequent), ...rootIdentifiers(node.alternate)];
        case 'TSAsExpression':
        case 'TSNonNullExpression':
            return rootIdentifiers(node.expression);
        case 'ObjectExpression':
            return node.properties.flatMap((property) => (property.type === 'Property' ? rootIdentifiers(property.value) : []));
        default:
            return [];
    }
};

const findVariable = (scope: Scope.Scope, name: string): Scope.Variable | undefined => {
    let current: Scope.Scope | null = scope;
    while (current) {
        const found = current.set.get(name);
        if (found) return found;
        current = current.upper;
    }
    return undefined;
};

const declaresCmsValue = (variable: Scope.Variable): boolean =>
    variable.defs.some((definition) => {
        if (definition.type === 'Variable') {
            const declarator = definition.node;
            if (readsCmsPage(declarator.init)) return true;
            return mentionsOutput(declarator.id.typeAnnotation);
        }
        if (definition.type === 'Parameter') {
            const parameter = definition.name.parent;
            if (!parameter) return false;
            if (parameter.type === 'Property' && parameter.parent.type === 'ObjectPattern')
                return mentionsOutput(parameter.parent.typeAnnotation);
            return 'typeAnnotation' in parameter
                ? mentionsOutput((parameter as { typeAnnotation?: TSESTree.TSTypeAnnotation }).typeAnnotation)
                : false;
        }
        return false;
    });

/**
 * Flags `dangerouslySetInnerHTML` fed from CMS content: a value read with
 * `cms.pages.<name>.get()`, a value typed `Output<…>`, or anything in a file
 * that imports `@kizunajs/cms`. CMS text is text; rich text is structured data
 * the component renders.
 */
export const noCmsHtml = createRule<[], MessageIds>({
    name: 'no-cms-html',
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow dangerouslySetInnerHTML on values that come from the CMS.',
        },
        schema: [],
        messages: {
            cmsHtml: 'CMS content is never HTML. Render {{value}} as text, or model rich text as structured data the component renders.',
        },
    },
    defaultOptions: [],
    create(context) {
        let importsCms = false;

        return {
            ImportDeclaration(node) {
                if (typeof node.source.value === 'string' && /^@kizunajs\/cms(\/|$)/.test(node.source.value)) importsCms = true;
            },
            JSXAttribute(node) {
                if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'dangerouslySetInnerHTML') return;
                const value = node.value;
                const expression =
                    value?.type === 'JSXExpressionContainer' && value.expression.type !== 'JSXEmptyExpression'
                        ? value.expression
                        : undefined;
                const html =
                    expression?.type === 'ObjectExpression'
                        ? expression.properties.find(
                              (property): property is TSESTree.Property =>
                                  property.type === 'Property' && property.key.type === 'Identifier' && property.key.name === '__html'
                          )?.value
                        : expression;
                const scope = context.sourceCode.getScope(node);
                const fromCms =
                    html !== undefined &&
                    rootIdentifiers(html).some((identifier) => {
                        const variable = findVariable(scope, identifier.name);
                        return variable !== undefined && declaresCmsValue(variable);
                    });
                if (!fromCms && !importsCms) return;
                context.report({
                    node,
                    messageId: 'cmsHtml',
                    data: {
                        value: html === undefined ? 'the value' : context.sourceCode.getText(html),
                    },
                });
            },
        };
    },
});
