import { z } from 'zod';
import { Kizuna, type RouteAuth, type Roles } from 'kizunajs';
import { route } from 'kizunajs/plugin';
import { ProblemDetailsSchema, ValidationErrorSchema } from 'kizunajs/schemas';
import { readDef, unwrapOptionalWrappers } from 'kizunajs/generator';
import { brandOf, CmsHttpError, type CmsService } from './cms.js';
import { dataFields, type Field } from './field.js';
import { blocksForWire, describeFields, describeLayout, getAtPath, type DescribedField } from './content.js';
import { parseFilter, type ItemCondition } from './item-list.js';
import { pathRefusal, type Caller } from './rules.js';
import { sameContent } from './same-content.js';
import { DescribedFieldSchema, DescribedLayoutSchema } from './wire.js';
import {
    accessRefusal,
    assertActionAccess,
    AvailableActionSchema,
    resolveActions,
    undeclaredAccess,
    writtenOut,
    type Editor,
    type ResolvedAction,
} from './action.js';
import {
    actionTool,
    appliesTo,
    assertApplies,
    assertMayRun,
    availableActions,
    handlerContext,
    type EditingArgs,
    type Guarded,
} from './action-routes.js';
import type { View, ViewCondition, ViewOperator, ViewRecords } from './view-definition.js';

export const ViewFilterSchema = Kizuna.model({
    title: 'CMS.ViewFilter',
    schema: z.object({
        field: z.string(),
        label: z.string().nullable().describe("The field's `label`, or `null` to show its name."),
        choices: z
            .array(
                z.object({
                    value: z.string(),
                    label: z.string(),
                })
            )
            .optional()
            .describe('The values a condition may name, with the label editors see for each.'),
        brand: z.string().optional().describe('The brand of the ids the field holds, which a condition names one of.'),
    }),
});

export const ViewSummarySchema = Kizuna.model({
    title: 'CMS.View',
    schema: z.object({
        name: z.string(),
        label: z.string(),
        group: z.string().nullable().describe('The heading the sidebar lists it under.'),
        title: z.string().describe('The field that names each record in the list.'),
        columns: z.array(z.string()).describe('The fields the list shows.'),
        options: z
            .record(z.string(), z.record(z.string(), z.string()))
            .describe('For each column holding a choice, the label editors see for each value, like Admin for admin.'),
        labels: z
            .record(z.string(), z.string())
            .describe(
                'For each column and field the search looks in whose field declares a `label`, that label, like Signed up for signedUpAt.'
            ),
        formats: z
            .record(z.string(), z.enum(['date', 'date-time']))
            .describe('For each column holding a date or a date and time, its JSON Schema `format`, so the list shows it as one.'),
        search: z.array(z.string()).describe('The fields the search box looks in.'),
        filters: z.array(ViewFilterSchema).describe('The fields the list filters by.'),
        sorts: z.array(z.string()).describe('The fields the list sorts by.'),
        readOnly: z.boolean().describe('Whether the caller may save nothing in it.'),
    }),
});

export const ViewRowSchema = Kizuna.model({
    title: 'CMS.ViewRow',
    schema: z.object({
        id: z.string(),
        title: z.string(),
        values: z.record(z.string(), z.unknown()).describe("The list's columns, keyed by field."),
    }),
});

export const ViewRecordSchema = Kizuna.model({
    title: 'CMS.ViewRecord',
    schema: z.object({
        view: z.string(),
        id: z.string(),
        title: z.string(),
        readOnly: z.boolean().describe('Whether the caller may save nothing in it.'),
        fields: z.array(DescribedFieldSchema),
        layout: z.array(DescribedLayoutSchema),
        actions: z.array(AvailableActionSchema).describe('The buttons beside save the caller may press.'),
        item: z.record(z.string(), z.unknown()).describe('The record, as its fields show it.'),
    }),
});

export const ViewSaveBodySchema = z.object({
    data: z
        .record(z.string(), z.unknown())
        .describe('The fields to save, keyed by name. Read the record first to learn the fields and which you may write.'),
});

const labelOf = (view: View): string => view.label ?? writtenOut(view.name);

/**
 * A value as JSON carries it, so a stored `Date` compares with the string an
 * editor sends back.
 */
const asJson = (value: unknown): unknown => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

const titleFieldOf = (view: View): string =>
    view.title ??
    dataFields(view.fields).find((field) => readDef(unwrapOptionalWrappers(field.schema).inner).type === 'string')?.name ??
    'id';

const allFields = (fields: readonly DescribedField[]): DescribedField[] =>
    fields.flatMap((field) => [field, ...allFields(field.fields ?? [])]);

const recordsOf = (result: unknown): readonly object[] => {
    if (Array.isArray(result)) return result;
    const data = (result as { data?: unknown } | null | undefined)?.data;
    return Array.isArray(data) ? data : [];
};

const idOf = (view: View, record: object): string => {
    const id = (record as { id?: unknown }).id;
    if (typeof id !== 'string' && typeof id !== 'number') {
        throw new Error(`The ${view.name} view read a record with no \`id\`. Every record its list and get return carries one.`);
    }
    return String(id);
};

const titleOf = (view: View, record: object): string => {
    const value = (record as Record<string, unknown>)[titleFieldOf(view)];
    return value === undefined || value === null ? idOf(view, record) : String(value);
};

/**
 * The record with only what its fields show, and its id.
 */
const shownOf = (view: View, record: object): Record<string, unknown> => {
    const shown: Record<string, unknown> = {
        id: idOf(view, record),
    };
    for (const field of dataFields(view.fields)) {
        const value = asJson((record as Record<string, unknown>)[field.name]);
        if (value !== undefined) shown[field.name] = value;
    }
    return shown;
};

const assertSees = (view: View, caller: Caller): void => {
    const refusal = accessRefusal(view.auth, caller, `The ${labelOf(view)} view`);
    if (refusal !== undefined) {
        throw new CmsHttpError(403, {
            detail: refusal,
        });
    }
};

const findRecord = async (view: View, id: string, editor: Editor): Promise<object> => {
    const record = await view.get({
        id,
        editor,
    });
    if (record === undefined || record === null) {
        throw new CmsHttpError(404, {
            detail: `There is no record '${id}' in ${labelOf(view)}.`,
        });
    }
    return record;
};

const saveOf = (view: View): ResolvedAction | undefined => resolveActions(view.actions).find((action) => action.key === 'save');

const mayRun = (action: ResolvedAction | undefined, caller: Caller): boolean =>
    action !== undefined && accessRefusal(action.auth, caller, action.label) === undefined;

/**
 * The fields of one record as the editor and the tools meet them: each with
 * its value and whether the caller may write it.
 */
const describeRecord = (cms: CmsService, view: View, record: object, caller: Caller) => {
    const save = saveOf(view);
    const saves = save !== undefined && mayRun(save, caller) && appliesTo(save, record);
    const described: z.output<typeof DescribedFieldSchema>[] = [];
    const push = (field: DescribedField, parent: string | undefined): void => {
        const roles =
            field.auth?.roles === undefined ? undefined : typeof field.auth.roles === 'string' ? [field.auth.roles] : [...field.auth.roles];
        const brand = cms.referenceBrandOf(field.schema);
        const value = asJson(getAtPath(record, field.path));
        described.push({
            path: field.path,
            name: field.name,
            ...(field.label === undefined
                ? {}
                : {
                      label: field.label,
                  }),
            ...(field.options === undefined
                ? {}
                : {
                      options: field.options,
                  }),
            ...(field.description === undefined
                ? {}
                : {
                      description: field.description,
                      help: field.description,
                  }),
            ...(field.block === undefined
                ? {}
                : {
                      block: field.block,
                  }),
            ...(field.blocks === undefined
                ? {}
                : {
                      blocks: blocksForWire(field.blocks),
                  }),
            ...(parent === undefined
                ? {}
                : {
                      parent,
                  }),
            ...(field.position === undefined
                ? {}
                : {
                      position: field.position,
                  }),
            ...(field.width === undefined
                ? {}
                : {
                      width: field.width,
                  }),
            ...(field.layout.length === 0
                ? {}
                : {
                      layout: field.layout,
                  }),
            readOnly: field.readOnly,
            required: field.required,
            writable: saves && pathRefusal(view.fields, field.path, caller) === undefined,
            ...(roles === undefined
                ? {}
                : {
                      roles,
                  }),
            ...(brand === undefined
                ? {}
                : {
                      brand,
                  }),
            schema: cms.fieldJsonSchema(field.schema),
            ...(value === undefined
                ? {}
                : {
                      value,
                  }),
        });
        for (const inner of field.fields ?? []) push(inner, field.path);
    };
    for (const field of describeFields(view)) push(field, undefined);
    const others = resolveActions(view.actions).filter((action) => action.key !== 'save');
    return {
        view: view.name,
        id: idOf(view, record),
        title: titleOf(view, record),
        readOnly: !saves,
        fields: described,
        layout: describeLayout(view).map((item) => ({
            id: item.id,
            type: item.type,
            ...(item.label === undefined
                ? {}
                : {
                      label: item.label,
                  }),
            ...(item.position === undefined
                ? {}
                : {
                      position: item.position,
                  }),
        })),
        actions: availableActions(others, record, caller),
        item: shownOf(view, record),
    };
};

/**
 * The fields a save hands its handler. A field the caller may not write is
 * refused when its value changes, and left out when it does not.
 */
const writesOf = (view: View, record: object, sent: Record<string, unknown>, caller: Caller): Record<string, unknown> => {
    const fields = dataFields(view.fields);
    const unknown = Object.keys(sent).filter((name) => !fields.some((field) => field.name === name));
    if (unknown.length > 0) {
        throw new CmsHttpError(422, {
            detail: `${labelOf(view)} has no field ${unknown.map((name) => `'${name}'`).join(' or ')}.`,
            errors: unknown.map((name) => ({
                code: 'unrecognized_keys',
                path: [name],
                message: 'Unknown field',
            })),
        });
    }
    for (const field of allFields(describeFields(view))) {
        const [name] = field.path.split('.');
        if (!(name! in sent)) continue;
        const changed = !sameContent(asJson(getAtPath(record, field.path)), getAtPath(sent, field.path));
        const refusal = pathRefusal(view.fields, field.path, caller);
        if (changed && refusal !== undefined) {
            throw new CmsHttpError(403, {
                detail: refusal,
            });
        }
    }
    const data: Record<string, unknown> = {};
    const errors: Array<{ code: string; path: string[]; message: string }> = [];
    for (const field of fields) {
        if (!(field.name in sent)) continue;
        if (pathRefusal(view.fields, field.name, caller) !== undefined) continue;
        const parsed = field.schema.safeParse(sent[field.name]);
        if (parsed.success) {
            data[field.name] = parsed.data;
            continue;
        }
        for (const issue of parsed.error.issues) {
            errors.push({
                code: issue.code,
                path: [field.name, ...issue.path.map(String)],
                message: issue.message,
            });
        }
    }
    if (errors.length > 0) {
        throw new CmsHttpError(422, {
            detail: 'The data does not pass its fields.',
            errors,
        });
    }
    return data;
};

/**
 * After an action, the record as it stands, or nothing when it is gone.
 */
const afterAction = async (cms: CmsService, view: View, id: string, editor: Editor, caller: Caller) => {
    const record = await view.get({
        id,
        editor,
    });
    if (record === undefined || record === null) {
        return {
            status: 204,
        };
    }
    return {
        status: 200,
        body: describeRecord(cms, view, record, caller),
    };
};

interface ViewRouteInput {
    views: readonly View[];
    editor: RouteAuth;
    editingBase: `/${string}`;
    guarded: Guarded;
}

/**
 * The option labels of each column that holds a choice.
 */
const columnOptionsOf = (view: View): Record<string, Record<string, string>> =>
    Object.fromEntries(
        listedOf(view).flatMap((column) => {
            const options = dataFields(view.fields).find((field) => field.name === column)?.options;
            return options === undefined ? [] : [[column, options]];
        })
    );

/**
 * The label of each column, and of each field the search looks in, whose
 * field declares one.
 */
const columnLabelsOf = (view: View): Record<string, string> =>
    Object.fromEntries(
        [...new Set([...listedOf(view), ...(view.search ?? [])])].flatMap((column) => {
            const label = fieldOf(view, column)?.label;
            return label === undefined ? [] : [[column, label]];
        })
    );

/**
 * The `format` of each column holding a date or a date and time, read from
 * the JSON Schema of the value, or of each entry of a list.
 */
const columnFormatsOf = (
    view: View,
    jsonSchemaOf: (schema: z.core.$ZodType) => Record<string, unknown>
): Record<string, 'date' | 'date-time'> =>
    Object.fromEntries(
        listedOf(view).flatMap((column) => {
            const field = fieldOf(view, column);
            const format = field === undefined ? undefined : jsonSchemaOf(entrySchemaOf(field.schema)).format;
            return format === 'date' || format === 'date-time' ? [[column, format]] : [];
        })
    );

const EITHER = new Intl.ListFormat('en', {
    type: 'disjunction',
});

const OPERATORS: readonly ViewOperator[] = ['is', 'isNot'];

/**
 * The schema of what a condition compares with: the field's own, or one
 * entry of a list.
 */
const entrySchemaOf = (schema: z.core.$ZodType): z.core.$ZodType => {
    const inner = unwrapOptionalWrappers(schema).inner;
    const element = readDef(inner).element;
    return readDef(inner).type === 'array' && element !== undefined ? unwrapOptionalWrappers(element).inner : inner;
};

const fieldOf = (view: View, name: string): Field | undefined => dataFields(view.fields).find((field) => field.name === name);

/**
 * The values a condition on a field may name, for a choice or true or false.
 */
const choicesOf = (field: Field): Array<{ value: string; label: string }> | undefined => {
    const def = readDef(entrySchemaOf(field.schema));
    if (def.type === 'enum' && def.entries !== undefined) {
        return Object.values(def.entries).map((value) => ({
            value: String(value),
            label: field.options?.[String(value)] ?? String(value),
        }));
    }
    if (def.type === 'boolean') {
        return [
            {
                value: 'true',
                label: 'Yes',
            },
            {
                value: 'false',
                label: 'No',
            },
        ];
    }
    return undefined;
};

/**
 * Each field of a view's `filters`, with the values a condition may name.
 */
const filtersOf = (view: View, brandOfField: (schema: z.core.$ZodType) => string | undefined): Array<z.output<typeof ViewFilterSchema>> =>
    (view.filters ?? []).map((name) => {
        const field = fieldOf(view, name);
        const choices = field === undefined ? undefined : choicesOf(field);
        const brand = field === undefined ? undefined : brandOfField(field.schema);
        return {
            field: name,
            label: field?.label ?? null,
            ...(choices === undefined
                ? {}
                : {
                      choices,
                  }),
            ...(brand === undefined || choices !== undefined
                ? {}
                : {
                      brand,
                  }),
        };
    });

/**
 * What a condition on one filter may name, in words, like "editor or admin".
 */
const takesText = (filter: z.output<typeof ViewFilterSchema>): string =>
    filter.choices !== undefined
        ? EITHER.format(filter.choices.map((choice) => choice.value))
        : filter.brand !== undefined
          ? `an id of ${filter.brand}`
          : filter.field === 'id'
            ? "a record's id"
            : 'a value of the field';

/**
 * A condition as `list` receives it, its value read as the field holds it.
 * Answers `400` for a field the view does not filter by, or a value the
 * field cannot hold.
 */
const conditionOf = (view: View, condition: ItemCondition): ViewCondition => {
    const filters: readonly string[] = view.filters ?? [];
    if (!filters.includes(condition.field)) {
        throw new CmsHttpError(400, {
            detail: `The list of ${labelOf(view)} cannot filter by '${condition.field}'. It filters by ${filters.length === 0 ? 'no field' : filters.join(', ')}.`,
        });
    }
    if (!OPERATORS.includes(condition.operator as ViewOperator)) {
        throw new CmsHttpError(400, {
            detail: `A filter on ${labelOf(view)} compares with is or isNot, not '${condition.operator}'.`,
        });
    }
    const operator = condition.operator as ViewOperator;
    const field = fieldOf(view, condition.field);
    if (field === undefined) {
        return {
            field: condition.field,
            operator,
            value: condition.value,
        };
    }
    const schema = entrySchemaOf(field.schema);
    const type = readDef(schema).type;
    const raw = condition.value;
    const read =
        type === 'boolean'
            ? raw === 'true'
                ? true
                : raw === 'false'
                  ? false
                  : raw
            : type === 'number' && raw.trim() !== ''
              ? Number(raw)
              : type === 'date'
                ? new Date(raw)
                : raw;
    const parsed = z.safeParse(schema, read);
    if (!parsed.success) {
        const choices = choicesOf(field);
        const holds =
            choices !== undefined
                ? EITHER.format(choices.map((choice) => choice.value))
                : type === 'number'
                  ? 'a number'
                  : type === 'date'
                    ? 'a date'
                    : undefined;
        throw new CmsHttpError(400, {
            detail:
                holds === undefined
                    ? `The ${condition.field} field cannot hold '${raw}': ${parsed.error.issues[0]?.message ?? 'it does not pass the field'}.`
                    : `The ${condition.field} field holds ${holds}, not '${raw}'.`,
        });
    }
    return {
        field: condition.field,
        operator,
        value: parsed.data as ViewCondition['value'],
    };
};

/**
 * One page of what `list` returned, and how many match in all. `{ items,
 * total }` is a page already, and anything else every match, which the
 * page is taken out of.
 */
const pageOfRecords = (result: ViewRecords, limit: number | undefined, offset: number): { records: readonly object[]; total: number } => {
    if (!Array.isArray(result) && Array.isArray((result as { items?: unknown }).items)) {
        const page = result as { items: readonly object[]; total?: unknown };
        return {
            records: page.items,
            total: typeof page.total === 'number' ? page.total : page.items.length,
        };
    }
    const every = recordsOf(result);
    return {
        records: every.slice(offset, limit === undefined ? undefined : offset + limit),
        total: every.length,
    };
};

/**
 * The fields each row carries: the title, the columns, and the fields of
 * `sorts`, which the admin offers as columns too.
 */
const listedOf = (view: View): string[] => [...new Set([...(view.columns ?? [titleFieldOf(view)]), ...(view.sorts ?? [])])];

/**
 * `GET /editing/views`: the views the caller may open.
 */
export const listViewsRoute = (input: ViewRouteInput) =>
    route({
        method: 'GET',
        path: `${input.editingBase}/views`,
        auth: input.editor,
        summary: 'List the views of data the CMS does not store, like the app users, that the caller may open',
        tool: true,
        responses: {
            200: {
                body: z.object({
                    views: z.array(ViewSummarySchema),
                }),
                cache: 'no-store',
            },
        },
    }).handler(
        input.guarded(async (cms, args) => {
            const caller = cms.caller(args.auth);
            return {
                status: 200,
                body: {
                    views: input.views
                        .filter((view) => accessRefusal(view.auth, caller, view.name) === undefined)
                        .map((view) => ({
                            name: view.name,
                            label: labelOf(view),
                            group: view.group ?? null,
                            title: titleFieldOf(view),
                            columns: [...(view.columns ?? [titleFieldOf(view)])],
                            options: columnOptionsOf(view),
                            labels: columnLabelsOf(view),
                            formats: columnFormatsOf(view, (schema) => cms.fieldJsonSchema(schema)),
                            search: [...(view.search ?? [])],
                            filters: filtersOf(view, (schema) => cms.referenceBrandOf(schema)),
                            sorts: [...(view.sorts ?? [])],
                            readOnly: !mayRun(saveOf(view), caller),
                        })),
                },
            };
        }) as never
    );

const routesOfView = (view: View, input: ViewRouteInput) => {
    const label = labelOf(view);
    const noun = label.toLowerCase();
    const base = `${input.editingBase}/views/${view.name}/items` as const;
    const save = saveOf(view);
    const others = resolveActions(view.actions).filter((action) => action.key !== 'save');
    const idParams = z.object({
        id: z.string(),
    });

    const filters = filtersOf(view, brandOf);
    const sorts: readonly string[] = view.sorts ?? [];
    const firstFilter = filters[0];
    const example = firstFilter === undefined ? undefined : `${firstFilter.field}:is:${firstFilter.choices?.[0]?.value ?? 'value'}`;
    const list = route({
        method: 'GET',
        path: base,
        auth: input.editor,
        summary: `List the records of ${noun} that match a search`,
        tool: true,
        description: [
            'Pages with `limit` and `offset`, and counts every record that matches as `total`.',
            ...(filters.length === 0
                ? []
                : [`Filters by ${filters.map((filter) => `${filter.field} (${takesText(filter)})`).join(', ')}.`]),
            ...(sorts.length === 0 ? [] : [`Sorts by ${EITHER.format(sorts)}.`]),
        ].join(' '),
        query: z.object({
            q: z
                .string()
                .optional()
                .describe(
                    view.search === undefined || view.search.length === 0
                        ? 'What to search for.'
                        : `What to search for, in ${view.search.join(', ')}.`
                ),
            ...(filters.length === 0
                ? {}
                : {
                      filter: z
                          .array(z.string())
                          .optional()
                          .describe(
                              `Conditions, each \`field:operator:value\`, like \`${example}\`. \`field\` is ${EITHER.format(filters.map((filter) => filter.field))}. \`operator\` is \`is\` or \`isNot\`, and on a field holding a list \`is\` finds the value in it. The conditions all hold together, and an \`or\` entry between them starts another set that may hold instead.`
                          ),
                  }),
            ...(sorts.length === 0
                ? {}
                : {
                      orderBy: z
                          .enum(sorts as [string, ...string[]])
                          .optional()
                          .describe(`${EITHER.format(sorts)}. The order the view lists in when left out.`),
                      direction: z.enum(['asc', 'desc']).optional().describe('Ascending when left out.'),
                  }),
            limit: z.int().min(1).max(200).optional().describe('How many records a page holds. Without it, every record that matches.'),
            offset: z.int().min(0).optional().describe('How many matching records to skip, for the pages after the first.'),
        }),
        responses: {
            200: {
                body: z.object({
                    items: z.array(ViewRowSchema),
                    total: z.int().describe('How many records match, on every page together.'),
                }),
                cache: 'no-store',
            },
            400: ProblemDetailsSchema,
            403: ProblemDetailsSchema,
        },
    }).handler(
        input.guarded(async (cms, args: EditingArgs) => {
            assertSees(view, cms.caller(args.auth));
            const query = (args.query ?? {}) as {
                q?: string;
                filter?: string[];
                orderBy?: string;
                direction?: 'asc' | 'desc';
                limit?: number;
                offset?: number;
            };
            const parsed = parseFilter(query.filter ?? []);
            if ('problem' in parsed) {
                throw new CmsHttpError(400, {
                    detail: parsed.problem,
                });
            }
            const offset = query.offset ?? 0;
            const { records, total } = pageOfRecords(
                await view.list({
                    query: query.q ?? '',
                    filters: parsed.groups.map((group) => group.map((condition) => conditionOf(view, condition))),
                    orderBy: query.orderBy,
                    direction: query.direction ?? 'asc',
                    limit: query.limit,
                    offset,
                    editor: handlerContext(cms, args).editor,
                }),
                query.limit,
                offset
            );
            const columns = listedOf(view);
            return {
                status: 200,
                body: {
                    items: records.map((record) => ({
                        id: idOf(view, record),
                        title: titleOf(view, record),
                        values: Object.fromEntries(
                            columns.map((column) => [
                                column,
                                asJson(column === 'id' ? idOf(view, record) : (record as Record<string, unknown>)[column]) ?? null,
                            ])
                        ),
                    })),
                    total,
                },
            };
        }) as never
    );

    const get = route({
        method: 'GET',
        path: `${base}/:id`,
        auth: input.editor,
        summary: `Read one record of ${noun}: its fields, which the caller may write, and its buttons`,
        tool: true,
        pathParams: idParams,
        responses: {
            200: {
                body: ViewRecordSchema,
                cache: 'no-store',
            },
            403: ProblemDetailsSchema,
            404: ProblemDetailsSchema,
        },
    }).handler(
        input.guarded(async (cms, args) => {
            const caller = cms.caller(args.auth);
            assertSees(view, caller);
            const record = await findRecord(view, args.params['id']!, handlerContext(cms, args).editor);
            return {
                status: 200,
                body: describeRecord(cms, view, record, caller),
            };
        }) as never
    );

    const saveRoute =
        save === undefined
            ? undefined
            : route({
                  method: 'PATCH',
                  path: `${base}/:id`,
                  auth: input.editor,
                  summary: `Save fields of one record of ${noun}`,
                  tool: actionTool(save),
                  description:
                      'Sends the fields to save, keyed by name. A field the caller may not write is refused when its value changes. Read the record first.',
                  pathParams: idParams,
                  body: ViewSaveBodySchema,
                  responses: {
                      200: ViewRecordSchema,
                      204: z.void(),
                      403: ProblemDetailsSchema,
                      404: ProblemDetailsSchema,
                      409: ProblemDetailsSchema,
                      422: ValidationErrorSchema,
                  },
              }).handler(
                  input.guarded(async (cms, args) => {
                      const caller = cms.caller(args.auth);
                      assertSees(view, caller);
                      const id = args.params['id']!;
                      const context = handlerContext(cms, args);
                      const record = await findRecord(view, id, context.editor);
                      assertMayRun(save, caller);
                      assertApplies(save, record);
                      const data = writesOf(view, record, (args.body as z.output<typeof ViewSaveBodySchema>).data, caller);
                      await save.handler({
                          id,
                          item: record,
                          data,
                          ...context,
                      });
                      return afterAction(cms, view, id, context.editor, caller);
                  }) as never
              );

    const actions = Object.fromEntries(
        others.map((action) => [
            action.key,
            route({
                method: 'POST',
                path: `${base}/:id/actions/${action.key}`,
                auth: input.editor,
                summary: `Run "${action.label}" on one record of ${noun}`,
                tool: actionTool(action),
                ...(action.confirm === undefined
                    ? {}
                    : {
                          description: `Asks first: "${action.confirm}"`,
                      }),
                pathParams: idParams,
                responses: {
                    200: ViewRecordSchema,
                    204: z.void(),
                    403: ProblemDetailsSchema,
                    404: ProblemDetailsSchema,
                    409: ProblemDetailsSchema,
                },
            }).handler(
                input.guarded(async (cms, args) => {
                    const caller = cms.caller(args.auth);
                    assertSees(view, caller);
                    const id = args.params['id']!;
                    const context = handlerContext(cms, args);
                    const record = await findRecord(view, id, context.editor);
                    assertMayRun(action, caller);
                    assertApplies(action, record);
                    await action.handler({
                        id,
                        item: record,
                        ...context,
                    });
                    return afterAction(cms, view, id, context.editor, caller);
                }) as never
            ),
        ])
    );

    return {
        list,
        get,
        ...(saveRoute === undefined
            ? {}
            : {
                  save: saveRoute,
              }),
        ...(others.length === 0
            ? {}
            : {
                  actions,
              }),
    };
};

/**
 * Each view's routes: `list` and `get`, `save` when it has one, and one
 * route per other action, all run as the signed-in editor.
 */
export const viewRoutes = (input: ViewRouteInput) => Object.fromEntries(input.views.map((view) => [view.name, routesOfView(view, input)]));

/**
 * Checks that cannot run before the api assembles: names no other content
 * takes, and roles and permissions the editor identity declares.
 */
export const assertViews = (views: readonly View[], taken: readonly string[], roles: Roles | undefined, label: string): void => {
    const names = new Set<string>();
    for (const view of views) {
        if (names.has(view.name)) throw new Error(`Two views are named '${view.name}'. Give one of them another name.`);
        if (taken.includes(view.name)) {
            throw new Error(`The view '${view.name}' has the name of a global or a collection. Give one of them another name.`);
        }
        names.add(view.name);
        const owner = `View '${view.name}'`;
        const [first] = undeclaredAccess(view.auth, roles);
        if (first !== undefined) throw new Error(`${owner} ${first}, which ${label} does not declare.`);
        for (const field of allFields(describeFields(view))) {
            const [undeclared] = undeclaredAccess(field.auth, roles);
            if (undeclared !== undefined) throw new Error(`${owner} field '${field.path}' ${undeclared}, which ${label} does not declare.`);
        }
        assertActionAccess(resolveActions(view.actions), owner, roles, label);
    }
};
