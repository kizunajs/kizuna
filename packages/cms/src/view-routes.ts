import { z } from 'zod';
import { Kizuna, type RouteAuth, type Roles } from 'kizunajs';
import { route } from 'kizunajs/plugin';
import { ProblemDetailsSchema, ValidationErrorSchema } from 'kizunajs/schemas';
import { readDef, unwrapOptionalWrappers } from 'kizunajs/generator';
import { CmsHttpError, type CmsService } from './cms.js';
import { dataFields } from './field.js';
import { describeFields, describeLayout, getAtPath, type DescribedField } from './content.js';
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
import type { View } from './view-definition.js';

export const ViewSummarySchema = Kizuna.model({
    title: 'Cms.View',
    schema: z.object({
        name: z.string(),
        label: z.string(),
        group: z.string().nullable().describe('The heading the sidebar lists it under.'),
        title: z.string().describe('The field that names each record in the list.'),
        columns: z.array(z.string()).describe('The fields the list shows.'),
        search: z.array(z.string()).describe('The fields the search box looks in.'),
        readOnly: z.boolean().describe('Whether the caller may save nothing in it.'),
    }),
});

export const ViewRowSchema = Kizuna.model({
    title: 'Cms.ViewRow',
    schema: z.object({
        id: z.string(),
        title: z.string(),
        values: z.record(z.string(), z.unknown()).describe("The list's columns, keyed by field."),
    }),
});

export const ViewRecordSchema = Kizuna.model({
    title: 'Cms.ViewRecord',
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
                            search: [...(view.search ?? [])],
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

    const list = route({
        method: 'GET',
        path: base,
        auth: input.editor,
        summary: `List the records of ${noun} that match a search`,
        tool: true,
        query: z.object({
            q: z
                .string()
                .optional()
                .describe(
                    view.search === undefined || view.search.length === 0
                        ? 'What to search for.'
                        : `What to search for, in ${view.search.join(', ')}.`
                ),
        }),
        responses: {
            200: {
                body: z.object({
                    items: z.array(ViewRowSchema),
                }),
                cache: 'no-store',
            },
            403: ProblemDetailsSchema,
        },
    }).handler(
        input.guarded(async (cms, args: EditingArgs) => {
            assertSees(view, cms.caller(args.auth));
            const records = recordsOf(
                await view.list({
                    query: (args.query?.['q'] as string | undefined) ?? '',
                    editor: handlerContext(cms, args).editor,
                })
            );
            const columns = view.columns ?? [titleFieldOf(view)];
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
