import { z } from 'zod';
import type { RouteAuth } from 'kizunajs';
import { route } from 'kizunajs/plugin';
import { ProblemDetailsSchema, ValidationErrorSchema } from 'kizunajs/schemas';
import type { CmsService } from './cms.js';
import type { EditingArgs, Guarded } from './action-routes.js';
import {
    addToRelease,
    createRelease,
    deleteRelease,
    draftsWithChanges,
    getRelease,
    listScheduled,
    publishRelease,
    removeFromRelease,
    renameRelease,
    scheduleRelease,
    unscheduleRelease,
} from './schedules.js';
import {
    CreateReleaseBodySchema,
    DraftCandidatesSchema,
    ReleasePublishBodySchema,
    ReleaseRefsBodySchema,
    ReleaseScheduleBodySchema,
    ReleaseSchema,
    RenameReleaseBodySchema,
    ScheduledSchema,
} from './wire.js';

const ReleaseParamsSchema = z.object({
    id: z.string().describe('The release, like rel_8f2k3j9x2a1b.'),
});

/**
 * What is set to change, and the releases: the routes behind the admin's
 * Scheduled screen and a release's page.
 */
export const scheduleRoutes = (input: { editor: RouteAuth; editingBase: `/${string}`; guarded: Guarded }) => {
    const { editor, editingBase, guarded } = input;
    const by = (cms: CmsService, args: EditingArgs): string => cms.author(args.auth?.[cms.identity]);
    const releasePath = `${editingBase}/releases/:id` as const;
    const answer = (body: unknown) => ({
        status: 200,
        body,
    });

    const list = route({
        method: 'GET',
        path: `${editingBase}/schedules`,
        auth: editor,
        summary: 'List what is set to publish or unpublish, and the releases',
        description:
            'Documents scheduled on their own, and the releases that have not published yet, soonest first. With `site`, only what changes on that site: its own documents and the shared ones it shows. Each says what would stop it, like a review it waits for.',
        tool: {
            readOnlyHint: true,
        },
        query: z.object({
            site: z.string().optional().describe('Only what changes on this site, by its key.'),
        }),
        responses: {
            200: {
                body: ScheduledSchema,
                cache: 'no-store',
            },
            404: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) =>
            answer(await listScheduled(cms, cms.access(args.auth), by(cms, args), (args.query as { site?: string } | undefined)?.site))
        ) as never
    );

    const drafts = route({
        method: 'GET',
        path: `${editingBase}/schedules/drafts`,
        auth: editor,
        summary: 'List the drafts with changes that could be scheduled or put in a release',
        description:
            "Every page, global and item whose draft differs from what is live, newest first. With `site`, that site's and the shared ones it shows.",
        tool: {
            readOnlyHint: true,
        },
        query: z.object({
            site: z.string().optional().describe('Only what changes on this site, by its key.'),
        }),
        responses: {
            200: {
                body: DraftCandidatesSchema,
                cache: 'no-store',
            },
            404: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) =>
            answer({
                drafts: await draftsWithChanges(cms, cms.access(args.auth), (args.query as { site?: string } | undefined)?.site),
            })
        ) as never
    );

    const get = route({
        method: 'GET',
        path: releasePath,
        auth: editor,
        summary: 'Read a release and its documents',
        description: 'Each document says whether it would publish now, or what it waits for.',
        tool: {
            readOnlyHint: true,
        },
        pathParams: ReleaseParamsSchema,
        responses: {
            200: {
                body: ReleaseSchema,
                cache: 'no-store',
            },
            404: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) => answer(await getRelease(cms, cms.access(args.auth), args.params['id']!, by(cms, args)))) as never
    );

    const create = route({
        method: 'POST',
        path: `${editingBase}/releases`,
        auth: editor,
        summary: 'Make a release: a named set of drafts that publish together',
        description:
            'Name it after what it is for, like "Trondheim opening", and pass the documents by ref. Nothing publishes until someone schedules or publishes the release.',
        tool: true,
        body: CreateReleaseBodySchema,
        responses: {
            201: ReleaseSchema,
            404: ProblemDetailsSchema,
            409: ProblemDetailsSchema,
            422: ValidationErrorSchema,
        },
    }).handler(
        guarded(async (cms, args) => ({
            status: 201,
            body: await createRelease(cms, cms.access(args.auth), args.body as z.output<typeof CreateReleaseBodySchema>, by(cms, args)),
        })) as never
    );

    const rename = route({
        method: 'PATCH',
        path: releasePath,
        auth: editor,
        summary: 'Rename a release',
        tool: {
            idempotentHint: true,
        },
        pathParams: ReleaseParamsSchema,
        body: RenameReleaseBodySchema,
        responses: {
            200: ReleaseSchema,
            404: ProblemDetailsSchema,
            409: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) =>
            answer(
                await renameRelease(
                    cms,
                    cms.access(args.auth),
                    args.params['id']!,
                    (args.body as z.output<typeof RenameReleaseBodySchema>).name,
                    by(cms, args)
                )
            )
        ) as never
    );

    const add = route({
        method: 'POST',
        path: `${releasePath}/add`,
        auth: editor,
        summary: 'Put documents in a release',
        description:
            'A document sits in one release at a time, and a document scheduled on its own answers 409 until its schedule is cancelled.',
        tool: {
            idempotentHint: true,
        },
        pathParams: ReleaseParamsSchema,
        body: ReleaseRefsBodySchema,
        responses: {
            200: ReleaseSchema,
            404: ProblemDetailsSchema,
            409: ProblemDetailsSchema,
            422: ValidationErrorSchema,
        },
    }).handler(
        guarded(async (cms, args) =>
            answer(
                await addToRelease(
                    cms,
                    cms.access(args.auth),
                    args.params['id']!,
                    (args.body as z.output<typeof ReleaseRefsBodySchema>).refs,
                    by(cms, args)
                )
            )
        ) as never
    );

    const remove = route({
        method: 'POST',
        path: `${releasePath}/remove`,
        auth: editor,
        summary: 'Take documents out of a release',
        description: 'Their drafts stay as they are.',
        tool: {
            idempotentHint: true,
            destructiveHint: false,
        },
        pathParams: ReleaseParamsSchema,
        body: ReleaseRefsBodySchema,
        responses: {
            200: ReleaseSchema,
            404: ProblemDetailsSchema,
            409: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) =>
            answer(
                await removeFromRelease(
                    cms,
                    cms.access(args.auth),
                    args.params['id']!,
                    (args.body as z.output<typeof ReleaseRefsBodySchema>).refs,
                    by(cms, args)
                )
            )
        ) as never
    );

    const schedule = route({
        method: 'PUT',
        path: `${releasePath}/schedule`,
        auth: editor,
        summary: 'Schedule a release to publish at a time',
        description:
            'Every document publishes together when the time comes, or none does: a document that waits for a review or misses a field holds the whole release until it would publish. It takes someone who may publish every document in it. The person confirms before this runs.',
        tool: {
            needsApproval: true,
            destructiveHint: false,
            idempotentHint: true,
        },
        pathParams: ReleaseParamsSchema,
        body: ReleaseScheduleBodySchema,
        responses: {
            200: ReleaseSchema,
            403: ProblemDetailsSchema,
            404: ProblemDetailsSchema,
            409: ProblemDetailsSchema,
            422: ValidationErrorSchema,
        },
    }).handler(
        guarded(async (cms, args) =>
            answer(
                await scheduleRelease(
                    cms,
                    cms.access(args.auth),
                    args.params['id']!,
                    args.body as z.output<typeof ReleaseScheduleBodySchema>,
                    by(cms, args)
                )
            )
        ) as never
    );

    const unschedule = route({
        method: 'DELETE',
        path: `${releasePath}/schedule`,
        auth: editor,
        summary: "Take back a release's time",
        description: 'The release and its drafts stay, and nothing publishes until someone schedules or publishes it again.',
        tool: {
            idempotentHint: true,
            destructiveHint: false,
        },
        pathParams: ReleaseParamsSchema,
        responses: {
            200: ReleaseSchema,
            404: ProblemDetailsSchema,
            409: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) =>
            answer(await unscheduleRelease(cms, cms.access(args.auth), args.params['id']!, by(cms, args)))
        ) as never
    );

    const publish = route({
        method: 'POST',
        path: `${releasePath}/publish`,
        auth: editor,
        summary: 'Publish every document of a release now, together',
        description:
            'All of them go live in one step, or none does: the answer names each document that waits for a review or misses a field. It takes someone who may publish every document in it. The person confirms before this runs.',
        tool: {
            needsApproval: true,
            destructiveHint: false,
            idempotentHint: true,
        },
        pathParams: ReleaseParamsSchema,
        body: ReleasePublishBodySchema,
        responses: {
            200: ReleaseSchema,
            403: ProblemDetailsSchema,
            404: ProblemDetailsSchema,
            409: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) =>
            answer(
                await publishRelease(
                    cms,
                    cms.access(args.auth),
                    args.params['id']!,
                    (args.body as z.output<typeof ReleasePublishBodySchema>)?.force,
                    by(cms, args)
                )
            )
        ) as never
    );

    const drop = route({
        method: 'DELETE',
        path: releasePath,
        auth: editor,
        summary: 'Delete a release, keeping every draft in it',
        tool: {
            destructiveHint: false,
            idempotentHint: true,
        },
        pathParams: ReleaseParamsSchema,
        responses: {
            204: z.void(),
            403: ProblemDetailsSchema,
            404: ProblemDetailsSchema,
            409: ProblemDetailsSchema,
        },
    }).handler(
        guarded(async (cms, args) => {
            await deleteRelease(cms, cms.access(args.auth), args.params['id']!, by(cms, args));
            return {
                status: 204,
            };
        }) as never
    );

    return {
        schedules: {
            list,
            drafts,
        },
        releases: {
            get,
            create,
            rename,
            add,
            remove,
            schedule,
            unschedule,
            publish,
            delete: drop,
        },
    };
};
