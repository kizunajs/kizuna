import * as path from 'node:path';
import { ESLintUtils, type TSESTree } from '@typescript-eslint/utils';
import ts from 'typescript';
import { AUTHORING_NAMES } from 'kizunajs/authoring-names';
import { collectSchemaIssues, type SchemaIssue, type SchemaPosition, type SchemaResolver, type SchemaWire } from '../schema-violations.js';
import { collectUnsendableFields, type FieldIssue, type RequestPart } from '../field-shapes.js';

const SCHEMA_KEYS: ReadonlySet<string> = new Set(['body', 'query', 'pathParams', 'headers']);

const TEXT_KEYS: ReadonlySet<string> = new Set(['query', 'pathParams', 'headers']);

const FORM_CONTENT_TYPES: ReadonlySet<string> = new Set(['multipart/form-data', 'application/x-www-form-urlencoded']);

/**
 * The form content type a body's route declares, if it declares one.
 */
const formContentType = (property: TSESTree.Property): string | undefined => {
    const route = property.parent;
    if (route?.type !== 'ObjectExpression') return undefined;
    for (const sibling of route.properties) {
        if (
            sibling.type === 'Property' &&
            sibling.key.type === 'Identifier' &&
            sibling.key.name === 'contentType' &&
            sibling.value.type === 'Literal' &&
            typeof sibling.value.value === 'string' &&
            FORM_CONTENT_TYPES.has(sibling.value.value)
        )
            return sibling.value.value;
    }
    return undefined;
};

const PARTS: Readonly<Record<string, RequestPart>> = {
    pathParams: 'path',
    query: 'query',
    headers: 'header',
};

const createCheckerResolver =
    (checker: ts.TypeChecker): SchemaResolver =>
    (identifier) => {
        const symbol = checker.getSymbolAtLocation(identifier);
        if (!symbol) return undefined;
        const resolved = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
        return resolved.declarations?.find(ts.isVariableDeclaration)?.initializer;
    };

const createSourceResolver = (): SchemaResolver => {
    const sourceFileCache = new Map<string, ts.SourceFile | undefined>();
    const optionsCache = new Map<string, ts.CompilerOptions>();

    const readSourceFile = (fileName: string): ts.SourceFile | undefined => {
        if (sourceFileCache.has(fileName)) return sourceFileCache.get(fileName);
        const text = ts.sys.readFile(fileName);
        const sourceFile = text === undefined ? undefined : ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true);
        sourceFileCache.set(fileName, sourceFile);
        return sourceFile;
    };

    const compilerOptionsFor = (containingFile: string): ts.CompilerOptions => {
        const configPath = ts.findConfigFile(path.dirname(containingFile), ts.sys.fileExists);
        const key = configPath ?? '';
        const cached = optionsCache.get(key);
        if (cached) return cached;
        const options: ts.CompilerOptions = configPath
            ? ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, path.dirname(configPath)).options
            : { allowJs: true, moduleResolution: ts.ModuleResolutionKind.Bundler };
        optionsCache.set(key, options);
        return options;
    };

    const constNamed = (sourceFile: ts.SourceFile, name: string): ts.Expression | undefined => {
        for (const statement of sourceFile.statements) {
            if (!ts.isVariableStatement(statement)) continue;
            for (const declaration of statement.declarationList.declarations) {
                if (ts.isIdentifier(declaration.name) && declaration.name.text === name && declaration.initializer)
                    return declaration.initializer;
            }
        }
        return undefined;
    };

    const importedFrom = (sourceFile: ts.SourceFile, name: string): { specifier: string; exportedName: string } | undefined => {
        for (const statement of sourceFile.statements) {
            if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
            const named = statement.importClause?.namedBindings;
            if (!named || !ts.isNamedImports(named)) continue;
            for (const element of named.elements) {
                if (element.name.text === name)
                    return {
                        specifier: statement.moduleSpecifier.text,
                        exportedName: (element.propertyName ?? element.name).text,
                    };
            }
        }
        return undefined;
    };

    return (identifier) => {
        const sourceFile = identifier.getSourceFile();
        const local = constNamed(sourceFile, identifier.text);
        if (local) return local;

        const imported = importedFrom(sourceFile, identifier.text);
        if (!imported) return undefined;

        const resolved = ts.resolveModuleName(imported.specifier, sourceFile.fileName, compilerOptionsFor(sourceFile.fileName), ts.sys)
            .resolvedModule?.resolvedFileName;
        if (!resolved) return undefined;

        const target = readSourceFile(resolved);
        return target ? constNamed(target, imported.exportedName) : undefined;
    };
};

const MESSAGE_IDS = {
    coerce: ['coerce', 'coerceReference'],
    collection: ['collection', 'collectionReference'],
    union: ['union', 'unionReference'],
    transform: ['transform', 'transformReference'],
    nullable: ['nullable', 'nullableReference'],
} as const satisfies Record<SchemaIssue, readonly [string, string]>;

const calleeName = (node: TSESTree.CallExpression): string | undefined => {
    const { callee } = node;
    if (callee.type === 'Identifier') return callee.name;
    if (callee.type === 'MemberExpression' && callee.property.type === 'Identifier') return callee.property.name;
    return undefined;
};

interface SchemaSite {
    node: TSESTree.Node;
    position: SchemaPosition;
    wire: SchemaWire;
    part?: RequestPart;
}

const schemaNodesOf = (call: TSESTree.CallExpression): SchemaSite[] => {
    const name = calleeName(call);
    if (name === AUTHORING_NAMES.model) {
        const config = call.arguments[0];
        if (config?.type !== 'ObjectExpression') return [];
        const schema = config.properties.find(
            (property): property is TSESTree.Property =>
                property.type === 'Property' && property.key.type === 'Identifier' && property.key.name === 'schema'
        );
        // A model is reachable from either direction, so it is read as a request.
        return schema
            ? [
                  {
                      node: schema.value,
                      position: 'request',
                      wire: 'json',
                  },
              ]
            : [];
    }

    if (name !== AUTHORING_NAMES.routes && name !== AUTHORING_NAMES.defineConfig) return [];

    const nodes: SchemaSite[] = [];
    const visit = (node: TSESTree.Node): void => {
        if (node.type === 'Property') {
            const isSchemaField = node.key.type === 'Identifier' && SCHEMA_KEYS.has(node.key.name);
            const isStatusResponse = node.key.type === 'Literal' && typeof node.key.value === 'number';
            if (isSchemaField || isStatusResponse) {
                const key = node.key.type === 'Identifier' ? node.key.name : undefined;
                const form = key === 'body' ? formContentType(node) : undefined;
                const isText = key !== undefined && (TEXT_KEYS.has(key) || form !== undefined);
                const part: RequestPart | undefined =
                    form === 'multipart/form-data'
                        ? 'multipart'
                        : form !== undefined
                          ? 'urlencoded'
                          : key !== undefined
                            ? PARTS[key]
                            : undefined;
                nodes.push({
                    node: node.value,
                    position: isStatusResponse ? 'response' : 'request',
                    wire: isText ? 'text' : 'json',
                    part,
                });
            }
        }
        for (const [key, child] of Object.entries(node)) {
            if (key === 'parent') continue;
            if (Array.isArray(child)) child.forEach((item) => item?.type && visit(item));
            else if (child?.type) visit(child);
        }
    };
    for (const argument of call.arguments) visit(argument);
    return nodes;
};

export const noUnsupportedSchema = ESLintUtils.RuleCreator.withoutDocs({
    meta: {
        type: 'problem',
        docs: {
            description:
                'Disallow constructs no Kizuna client can generate a type for, in contract and model schemas, including imported ones.',
        },
        messages: {
            coerce: 'z.coerce is not supported in a Kizuna schema. kizuna coerces query, path, and header params automatically, use z.number(), z.date(), or z.bigint() instead.',
            coerceReference:
                'This schema uses z.coerce, which Kizuna does not support. kizuna coerces query, path, and header params automatically, use z.number(), z.date(), or z.bigint() instead.',
            collection:
                'z.set and z.map are not supported in a Kizuna schema. JSON has neither, so the value arrives as an empty object. Use z.array() for a set and z.record() for a map.',
            collectionReference:
                'This schema uses z.set or z.map, which JSON cannot carry. Use z.array() for a set and z.record() for a map.',
            union: 'A union of objects needs a discriminator, or nothing on the wire says which branch arrived. Use z.discriminatedUnion() instead.',
            unionReference:
                'This schema unions objects with no discriminator, so nothing on the wire says which branch arrived. Use z.discriminatedUnion() instead.',
            transform:
                'A transform on a response body has no type a client can generate, because its output is whatever the function returns. Declare the response as the shape it sends.',
            transformReference:
                'This response schema runs a transform, whose output no client can generate a type for. Declare the response as the shape it sends.',
            nullable:
                'A query, path, header or form field has no null, so every client leaves a null out and the server rejects the missing key. Use .optional() instead.',
            nullableReference:
                'This schema has a .nullable() field, which a query, path, header or form field cannot carry, since none of them has a null. Use .optional() instead.',
            unsendablePath:
                'A path parameter arrives as a single string, so a list or an object here cannot be sent. Use a scalar schema, or move the value to query.',
            unsendableQuery:
                'A query string carries values and lists of values, so an object, record, tuple or nested list here cannot be sent. Split it into fields of their own, or move it to a body.',
            unsendableHeader:
                'A header carries one value, so a list or an object here cannot be sent. Use a scalar schema, or split it into headers of their own.',
            unsendableForm:
                'A form carries values, lists of values and files, so an object, record or tuple here cannot be sent. Split it into fields of their own, or take the body as JSON.',
            binaryFormField: 'A form sends a file part as a File, so a BinarySchema field never validates. Declare it with FileSchema.',
            fileInUrlencoded: "A urlencoded body cannot carry a file. Send it as contentType: 'multipart/form-data'.",
        },
        schema: [],
    },
    defaultOptions: [],
    create(context) {
        const services = ESLintUtils.getParserServices(context, true);
        const resolve: SchemaResolver = services.program
            ? createCheckerResolver(services.program.getTypeChecker())
            : createSourceResolver();

        const reported = new Set<string>();

        return {
            CallExpression(call) {
                for (const { node: schemaNode, position, wire, part } of schemaNodesOf(call)) {
                    const tsNode = services.esTreeNodeToTSNodeMap.get(schemaNode);
                    const fieldIssues = part ? collectUnsendableFields(tsNode, resolve, part) : [];
                    for (const { issue, node, viaReference } of fieldIssues) {
                        const reportNode = (viaReference ? undefined : services.tsNodeToESTreeNodeMap.get(node)) ?? schemaNode;
                        const messageId: FieldIssue = issue;
                        const key = `${messageId}@${reportNode.range[0]}`;
                        if (reported.has(key)) continue;
                        reported.add(key);
                        context.report({ node: reportNode, messageId });
                    }
                    for (const { issue, node, viaReference } of collectSchemaIssues(tsNode, resolve, position, wire)) {
                        const reportNode = (viaReference ? undefined : services.tsNodeToESTreeNodeMap.get(node)) ?? schemaNode;
                        const messageId = MESSAGE_IDS[issue][viaReference ? 1 : 0];
                        const key = `${messageId}@${reportNode.range[0]}`;
                        if (reported.has(key)) continue;
                        reported.add(key);
                        context.report({ node: reportNode, messageId });
                    }
                }
            },
        };
    },
});
