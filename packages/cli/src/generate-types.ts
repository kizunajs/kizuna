import { dirname, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

/**
 * The keys of `KizunaConfigShape`, in the order the generated interface writes
 * them. Everything else a config declares, `routes` and `clients` included, is
 * read at runtime rather than typed against, so it stays out.
 */
const CONFIG_KEYS = ['adapter', 'tags', 'auth', 'requestContext', 'validation', 'jobs', 'plugins'] as const;

/**
 * The keys inside `auth`, which nests rather than flattening: `identities` is a
 * record of declarations, `guardSchema` is one.
 */
const AUTH_KEYS = ['identities', 'guardSchema'] as const;

type ConfigKey = (typeof CONFIG_KEYS)[number];

/**
 * Where one name came from, so the generated file can import the same thing.
 */
interface ImportedName {
    module: string;
    /**
     * The name as the source module exports it, which differs from the local
     * name under an alias.
     */
    exported: string;
    isDefault: boolean;
}

export class ConfigSyntaxError extends Error {}

/**
 * Every `import` in the config, keyed by the local name it binds.
 */
const collectImports = (source: ts.SourceFile): Map<string, ImportedName> => {
    const imports = new Map<string, ImportedName>();
    for (const statement of source.statements) {
        if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
        const module = statement.moduleSpecifier.text;
        const bindings = statement.importClause?.namedBindings;
        if (statement.importClause?.name) {
            imports.set(statement.importClause.name.text, { module, exported: 'default', isDefault: true });
        }
        if (bindings && ts.isNamedImports(bindings)) {
            for (const element of bindings.elements) {
                imports.set(element.name.text, {
                    module,
                    exported: (element.propertyName ?? element.name).text,
                    isDefault: false,
                });
            }
        }
    }
    return imports;
};

/**
 * The object literal handed to `defineConfig`, following a default export
 * through a `const` when the config names it before exporting it.
 */
const findConfigObject = (source: ts.SourceFile): ts.ObjectLiteralExpression => {
    let exported: ts.Expression | undefined;
    for (const statement of source.statements) {
        if (ts.isExportAssignment(statement) && !statement.isExportEquals) exported = statement.expression;
    }
    if (!exported) {
        throw new ConfigSyntaxError('No default export found. A kizuna config default-exports its `defineConfig(...)` call.');
    }

    const resolve = (expression: ts.Expression): ts.Expression => {
        if (!ts.isIdentifier(expression)) return expression;
        for (const statement of source.statements) {
            if (!ts.isVariableStatement(statement)) continue;
            for (const declaration of statement.declarationList.declarations) {
                if (ts.isIdentifier(declaration.name) && declaration.name.text === expression.text && declaration.initializer) {
                    return declaration.initializer;
                }
            }
        }
        return expression;
    };

    const call = resolve(exported);
    if (!ts.isCallExpression(call) || !ts.isIdentifier(call.expression) || call.expression.text !== 'defineConfig') {
        throw new ConfigSyntaxError('The default export is not a `defineConfig(...)` call.');
    }
    const [argument] = call.arguments;
    if (!argument || !ts.isObjectLiteralExpression(argument)) {
        throw new ConfigSyntaxError('`defineConfig` was called without an object literal, so there is nothing to read.');
    }
    return argument;
};

/**
 * The identifier a value is rooted at, so the generated file imports it. A call
 * is rooted at what it calls, which is how `expressAdapter()` reaches
 * `expressAdapter`.
 */
const rootIdentifier = (expression: ts.Expression): ts.Identifier | undefined => {
    if (ts.isIdentifier(expression)) return expression;
    if (ts.isCallExpression(expression)) return rootIdentifier(expression.expression as ts.Expression);
    return undefined;
};

/**
 * A value's type, as the generated interface writes it. A call becomes the
 * return of what it calls, because the config stores the call's result.
 */
const typeOfValue = (expression: ts.Expression, used: Set<string>, key: ConfigKey): string => {
    const root = rootIdentifier(expression);
    if (!root) {
        throw new ConfigSyntaxError(
            `\`${key}\` is not a name this generator can follow. Move the value to its own \`const\` and name it here.`
        );
    }
    used.add(root.text);
    return ts.isCallExpression(expression) ? `ReturnType<typeof ${root.text}>` : `typeof ${root.text}`;
};

/**
 * A record of declarations, as `identities` and `requestContext` take them.
 */
const typeOfRecord = (expression: ts.Expression, used: Set<string>, key: ConfigKey, indent: string): string => {
    if (!ts.isObjectLiteralExpression(expression)) return typeOfValue(expression, used, key);

    const lines: string[] = [];
    for (const property of expression.properties) {
        if (ts.isShorthandPropertyAssignment(property)) {
            used.add(property.name.text);
            lines.push(`${indent}    ${property.name.text}: typeof ${property.name.text};`);
            continue;
        }
        if (ts.isPropertyAssignment(property) && !ts.isComputedPropertyName(property.name)) {
            const name = ts.isIdentifier(property.name) ? property.name.text : property.name.getText();
            lines.push(`${indent}    ${name}: ${typeOfValue(property.initializer, used, key)};`);
            continue;
        }
        throw new ConfigSyntaxError(`\`${key}\` holds something this generator cannot follow. Every entry has to name a declaration.`);
    }
    return `{\n${lines.join('\n')}\n${indent}}`;
};

/**
 * The string literals in an array, as a union. This is what `issueCodes` is.
 */
const typeOfStringUnion = (expression: ts.Expression, key: ConfigKey): string => {
    if (!ts.isArrayLiteralExpression(expression)) {
        throw new ConfigSyntaxError(`\`${key}\` has to be an array of string literals.`);
    }
    const codes = expression.elements.map((element) => {
        if (!ts.isStringLiteral(element)) {
            throw new ConfigSyntaxError(`\`${key}\` has to hold string literals, so every code is known at compile time.`);
        }
        return `'${element.text}'`;
    });
    return codes.length > 0 ? codes.join(' | ') : 'never';
};

/**
 * Each plugin in order, as a tuple, so a handler reaches each one under its own
 * slug.
 */
const typeOfPluginList = (expression: ts.Expression, used: Set<string>): string => {
    if (!ts.isArrayLiteralExpression(expression)) {
        throw new ConfigSyntaxError('`plugins` has to be an array, so each plugin keeps its place.');
    }
    const entries = expression.elements.map((element) => typeOfValue(element as ts.Expression, used, 'plugins'));
    return `[${entries.join(', ')}]`;
};

/**
 * The `issueCodes` inside `validation`, or nothing when it declares none.
 */
const issueCodesOf = (expression: ts.Expression): string | undefined => {
    if (!ts.isObjectLiteralExpression(expression)) {
        throw new ConfigSyntaxError('`validation` has to be an object literal.');
    }
    for (const property of expression.properties) {
        if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name) && property.name.text === 'issueCodes') {
            return typeOfStringUnion(property.initializer, 'validation');
        }
    }
    return undefined;
};

/**
 * What `auth` carries: the identities, each as its own key, and the schema their
 * guards refuse with.
 */
const authLines = (expression: ts.Expression, used: Set<string>): string[] => {
    if (!ts.isObjectLiteralExpression(expression)) {
        throw new ConfigSyntaxError('`auth` has to be an object literal, so its identities can be read.');
    }
    const declared = new Map<string, ts.Expression>();
    for (const property of expression.properties) {
        if (ts.isShorthandPropertyAssignment(property)) declared.set(property.name.text, property.name);
        else if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name))
            declared.set(property.name.text, property.initializer);
    }

    const lines: string[] = [];
    for (const key of AUTH_KEYS) {
        const value = declared.get(key);
        if (!value) continue;
        lines.push(
            key === 'identities'
                ? `        identities: ${typeOfRecord(value, used, 'auth', '        ')};`
                : `        guardSchema: ${typeOfValue(value, used, 'auth')};`
        );
    }
    return lines;
};

const HEADER = `/**
 * This file was automatically generated by kizuna.
 * DO NOT MODIFY IT BY HAND. Instead, modify your source kizuna config,
 * and re-run \`kizuna generate\` to regenerate this file.
 */`;

/**
 * Points a relative specifier at the same file from somewhere else, so a
 * `Config` written outside the config's own directory still resolves.
 */
const rebaseSpecifier = (specifier: string, configDir: string, outputDir: string): string => {
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) return specifier;
    const rebased = relative(outputDir, resolve(configDir, specifier)).split(sep).join('/');
    return rebased.startsWith('.') ? rebased : `./${rebased}`;
};

/**
 * The `import type` lines the interface needs, grouped by module and written in
 * the order the config imported them.
 */
const renderImports = (imports: Map<string, ImportedName>, used: Set<string>, rebase: (specifier: string) => string): string => {
    const byModule = new Map<string, string[]>();
    const defaults: string[] = [];
    for (const [local, imported] of imports) {
        if (!used.has(local)) continue;
        const module = rebase(imported.module);
        if (imported.isDefault) {
            defaults.push(`import type ${local} from '${module}';`);
            continue;
        }
        const specifier = imported.exported === local ? local : `${imported.exported} as ${local}`;
        const existing = byModule.get(module);
        if (existing) existing.push(specifier);
        else byModule.set(module, [specifier]);
    }
    const named = [...byModule].map(([module, names]) => `import type { ${names.join(', ')} } from '${module}';`);
    return [...defaults, ...named].join('\n');
};

/**
 * Write the `Config` a `kizuna.config.ts` implies, which is what
 * `new Kizuna<Config>()` is typed by.
 *
 * Read from the config's syntax rather than by running it: the generated file
 * imports the same names the config did, and a config that loads is not a
 * prerequisite for typing the routes it serves.
 *
 * `outputPath` is what the imports are written relative to. Left out, they stay
 * relative to the config.
 */
export const generateConfigTypes = (configSource: string, fileName = 'kizuna.config.ts', outputPath?: string): string => {
    const source = ts.createSourceFile(fileName, configSource, ts.ScriptTarget.Latest, true);
    const imports = collectImports(source);
    const configObject = findConfigObject(source);

    const declared = new Map<string, ts.Expression>();
    for (const property of configObject.properties) {
        if (ts.isShorthandPropertyAssignment(property)) {
            declared.set(property.name.text, property.name);
            continue;
        }
        if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)) {
            declared.set(property.name.text, property.initializer);
        }
    }

    const used = new Set<string>();
    const lines: string[] = [];
    for (const key of CONFIG_KEYS) {
        const value = declared.get(key);
        if (!value) continue;
        if (key === 'auth') {
            const inner = authLines(value, used);
            if (inner.length > 0) lines.push(`    auth: {\n${inner.join('\n')}\n    };`);
        } else if (key === 'requestContext') {
            lines.push(`    ${key}: ${typeOfRecord(value, used, key, '    ')};`);
        } else if (key === 'validation') {
            const codes = issueCodesOf(value);
            if (codes !== undefined) lines.push(`    validation: {\n        issueCodes: ${codes};\n    };`);
        } else if (key === 'plugins') {
            lines.push(`    ${key}: ${typeOfPluginList(value, used)};`);
        } else {
            lines.push(`    ${key}: ${typeOfValue(value, used, key)};`);
        }
    }

    const configDir = dirname(resolve(fileName));
    const outputDir = outputPath === undefined ? configDir : dirname(resolve(outputPath));
    const importBlock = renderImports(imports, used, (specifier) =>
        outputDir === configDir ? specifier : rebaseSpecifier(specifier, configDir, outputDir)
    );
    const body = `export interface Config {\n${lines.join('\n')}\n}`;
    // The header sits directly on the imports, the way a generated file reads.
    const head = importBlock === '' ? HEADER : `${HEADER}\n${importBlock}`;
    return `${head}\n\n${body}\n`;
};
