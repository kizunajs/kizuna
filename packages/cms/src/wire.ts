import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { CropSchema, FocalPointSchema } from './image.js';
import { AvailableActionSchema } from './action.js';

/**
 * Where a page stands: nothing saved, a draft never published, published with
 * the draft matching, or published with newer draft changes.
 */
export const PageStatusSchema = z.enum(['empty', 'draft', 'published', 'changed']);

export const PageSummarySchema = Kizuna.model({
    title: 'CMS.PageSummary',
    schema: z.object({
        name: z.string(),
        site: z.string().describe('The site the page belongs to, default unless several apps share the CMS.'),
        ref: z
            .string()
            .describe(
                'page:<name>, page:<site>:<name> on a site of its own, or item:<collection>:<id> for an item a page shows at its address.'
            ),
        label: z.string().nullable().describe('What editors call the page, when it declares a label.'),
        path: z.string(),
        status: PageStatusSchema,
        group: z.string().nullable(),
        version: z.int().describe('The latest version saved, 0 before the first.'),
        publishedVersion: z.int().nullable(),
        updatedAt: z.string().nullable(),
        updatedBy: z.string().nullable(),
    }),
});

/**
 * Where an item sits in a collection with a `tree`, as the editing list and
 * the picker answer it.
 */
export const TreePlacementShape = {
    parent: z
        .string()
        .nullable()
        .optional()
        .describe('The id of the item it sits under, null at the top. Only in a collection with a tree.'),
    treeLabel: z
        .string()
        .optional()
        .describe('Its label after the labels of the items above it, like "Lighting / Workshop". Only in a collection with a tree.'),
};

export const EditorItemSchema = Kizuna.model({
    title: 'CMS.EditorItem',
    schema: z.object({
        id: z.string(),
        ref: z.string(),
        label: z.string().describe('The first text field of the item, or Untitled.'),
        path: z.string().nullable().describe('Where a page shows the item, once its address fields are filled; null when no page does.'),
        status: PageStatusSchema,
        complete: z.boolean(),
        updatedAt: z.string(),
        updatedBy: z.string(),
        ...TreePlacementShape,
    }),
});

export const CreateItemBodySchema = z
    .object({
        values: z.record(z.string(), z.unknown()).optional().describe('Field values for the new item, keyed by field path.'),
    })
    .optional();

export const PublishedPageSchema = Kizuna.model({
    title: 'CMS.PublishedPage',
    schema: z.object({
        name: z.string(),
        path: z.string(),
        version: z.int(),
        content: z.record(z.string(), z.unknown()),
        updatedAt: z.string(),
    }),
});

export const DraftPageSchema = Kizuna.model({
    title: 'CMS.Draft',
    schema: z.object({
        ref: z.string().describe('The document: page:<name>, page:<site>:<name>, global:<name> or item:<collection>:<id>.'),
        name: z.string(),
        path: z
            .string()
            .nullable()
            .describe("Where it is served: a page's path, or an item's address on the page that shows it. Null otherwise."),
        status: PageStatusSchema,
        version: z.int(),
        publishedVersion: z.int().nullable(),
        content: z.record(z.string(), z.unknown()).nullable(),
        complete: z.boolean().describe('Whether the draft passes the page schema and may be rendered.'),
        missing: z.array(z.string()).describe('The fields the draft is missing or fails.'),
        updatedAt: z.string().nullable(),
        updatedBy: z.string().nullable(),
    }),
});

export const StoredContentSchema = Kizuna.model({
    title: 'CMS.StoredContent',
    schema: z.object({
        ref: z.string(),
        version: z.int(),
        updatedAt: z.string(),
        content: z
            .record(z.string(), z.unknown())
            .describe('The content as stored: images are references with their crop and focal point.'),
    }),
});

export const DraftHeadersSchema = z.object({
    etag: z.string(),
});

export const DescribedFieldSchema = Kizuna.model({
    title: 'CMS.Field',
    schema: z.object({
        path: z.string().describe('The dotted path a change is keyed by.'),
        name: z.string(),
        label: z.string().optional(),
        options: z.record(z.string(), z.string()).optional().describe('For an enum, the label editors see for each value.'),
        description: z.string().optional(),
        help: z.string().optional().describe('What an editor reads under the field: the description, without the guidance for agents.'),
        block: z.string().optional().describe('The block name, when the field is a block.'),
        parent: z.string().optional().describe('The path of the block field this one sits in.'),
        position: z.enum(['sidebar']).optional().describe('Where the editor shows it, when beside the main column.'),
        width: z.string().optional().describe('How much of a row it takes, like 50%.'),
        layout: z
            .array(z.string())
            .optional()
            .describe('The ids of the tabs, rows and collapsibles it sits in, outermost first, from the layout list.'),
        readOnly: z.boolean(),
        required: z.boolean().describe('Whether the document needs a value here before it can publish.'),
        writable: z.boolean().describe('Whether the caller may write this field.'),
        roles: z.array(z.string()).optional().describe('The roles that may write it, when narrowed.'),
        brand: z.string().optional().describe('The brand of the ids this field holds, when a collection or relationship holds them.'),
        searchTool: z.string().optional().describe('The tool that finds ids for the brand.'),
        schema: z.record(z.string(), z.unknown()).describe('The JSON Schema of the value.'),
        value: z.unknown().optional().describe('The current draft value.'),
    }),
});

export const DescribedLayoutSchema = Kizuna.model({
    title: 'CMS.Layout',
    schema: z.object({
        id: z.string().describe('What the fields inside it name in their layout.'),
        type: z.enum(['tab', 'row', 'collapsible']),
        label: z.string().optional().describe('What a tab or a collapsible reads.'),
        position: z.enum(['sidebar']).optional().describe('Where the editor shows a collapsible, when beside the main column.'),
    }),
});

export const UsedOnSchema = z
    .object({
        everywhere: z.boolean().describe('A global, which every page may show.'),
        pages: z.array(
            z.object({
                name: z.string(),
                path: z.string(),
            })
        ),
    })
    .describe('Where else the document appears, to say before changing shared content.');

export const PersonSchema = Kizuna.model({
    title: 'CMS.Person',
    schema: z.object({
        id: z.string(),
        name: z.string(),
        image: z.string().optional().describe('A picture of them, as a URL.'),
    }),
});

export const ReviewStateSchema = Kizuna.model({
    title: 'CMS.ReviewState',
    schema: z.object({
        id: z.string(),
        status: z
            .enum(['open', 'approved', 'changes', 'outdated'])
            .describe('Waiting for an answer, approved, sent back with changes to make, or approved before the draft changed again.'),
        version: z.int().describe('The draft version it was asked about, or the one the reviewer answered.'),
        reviewers: z.array(PersonSchema),
        requestedBy: PersonSchema,
        note: z.string().nullable(),
        createdAt: z.iso.datetime(),
        decidedBy: PersonSchema.nullable(),
        decisionNote: z.string().nullable(),
        decidedAt: z.iso.datetime().nullable(),
    }),
});

/**
 * Who looks after a document, and where its review stands.
 */
const ReviewFields = {
    owner: PersonSchema.nullable().describe('The person who looks after it, if anyone does.'),
    review: ReviewStateSchema.nullable().describe('Its latest review since it was last published.'),
    requireReview: z.boolean().describe('Whether publishing waits for an approval.'),
};

export const DescribedPageSchema = Kizuna.model({
    title: 'CMS.Described',
    schema: z.object({
        ref: z.string(),
        kind: z.enum(['page', 'global', 'item']),
        name: z.string(),
        label: z.string().optional().describe('What editors call it. For an item, what they call its collection.'),
        path: z.string().nullable(),
        previewPath: z
            .string()
            .nullable()
            .describe(
                "The page the Live preview opens on: an item's `preview.url`, where the document is served, or the first page that shows it. Null when no page shows it."
            ),
        usedOn: UsedOnSchema,
        status: PageStatusSchema,
        version: z.int(),
        complete: z.boolean(),
        missing: z.array(z.string()),
        fields: z.array(DescribedFieldSchema),
        layout: z
            .array(DescribedLayoutSchema)
            .describe(
                'The tabs, rows and collapsibles that arrange the fields, in the order they are shown. Empty when the fields are listed plainly.'
            ),
        draft: z.record(z.string(), z.unknown()).nullable(),
        actions: z.array(AvailableActionSchema).optional().describe("For an item, the buttons its collection's actions show the caller."),
        ...ReviewFields,
    }),
});

export const MissingFieldsSchema = Kizuna.model({
    title: 'CMS.MissingFields',
    schema: z.object({
        name: z.string(),
        complete: z.boolean(),
        missing: z.array(z.string()),
        prompt: z.string().describe('Something to ask an agent, like "Fill in the front page."'),
    }),
});

export const VersionSchema = Kizuna.model({
    title: 'CMS.Version',
    schema: z.object({
        version: z.int(),
        summary: z.string().nullable(),
        createdAt: z.string(),
        createdBy: z.string(),
        published: z.boolean().describe('Whether this is the version readers see.'),
    }),
});

export const DraftChangesSchema = Kizuna.model({
    title: 'CMS.DraftChanges',
    schema: z.object({
        ref: z.string(),
        label: z.string().describe('What editors call the document.'),
        path: z.string().nullable(),
        published: z.boolean().describe('Whether anything is published yet. When not, every filled field is a change.'),
        ...ReviewFields,
        canPublishPastReview: z.boolean().describe('Whether the caller may publish it before its review is approved, with `force`.'),
        changes: z
            .array(
                z.object({
                    path: z.string().describe('The field, as a change to it is keyed.'),
                    label: z.string(),
                    before: z.unknown().optional().describe('What visitors see now. Absent when the field is not published.'),
                    after: z.unknown().optional().describe('What publishing makes them see. Absent when the draft clears the field.'),
                    writable: z.boolean().describe('Whether the caller may revert it.'),
                })
            )
            .describe('One entry per field the draft changes, in the order the fields are shown.'),
    }),
});

export const RevertBodySchema = Kizuna.model({
    title: 'CMS.Revert',
    schema: z.object({
        paths: z.array(z.string()).min(1).describe('The fields to set back to what is published, from the changes list.'),
    }),
});

export const VersionListSchema = Kizuna.model({
    title: 'CMS.VersionList',
    schema: z.object({
        name: z.string(),
        versions: z.array(VersionSchema),
    }),
});

export const VersionContentSchema = Kizuna.model({
    title: 'CMS.VersionContent',
    schema: z.object({
        ref: z.string(),
        version: z.int(),
        summary: z.string().nullable(),
        createdAt: z.iso.datetime(),
        createdBy: z.string(),
        content: z.record(z.string(), z.unknown()).describe('The content as that version saved it, migrated to the current schema.'),
    }),
});

export const WhereUsedSchema = Kizuna.model({
    title: 'CMS.WhereUsed',
    schema: z.object({
        brand: z.string(),
        id: z.string(),
        pages: z.array(
            z.object({
                name: z.string(),
                site: z.string(),
                path: z.string(),
                fieldPaths: z.array(z.string()),
            })
        ),
    }),
});

export const UpdateDraftBodySchema = Kizuna.model({
    title: 'CMS.UpdateDraft',
    schema: z.object({
        changes: z
            .record(z.string(), z.unknown())
            .describe(
                'New values keyed by field path, like "hero.heading". Only fields the caller may write. null empties an optional field.'
            ),
        summary: z.string().max(200).optional().describe('What changed, in a sentence, for the history.'),
        autosave: z
            .boolean()
            .optional()
            .describe('Fold into your own recent unpublished version instead of adding one, as the live preview does while you type.'),
    }),
});

export const UpdateDraftHeadersSchema = z.object({
    'if-match': z.string().optional().describe('The ETag read with the draft. A stale one is refused.'),
});

export const PublishBodySchema = z
    .object({
        summary: z.string().max(200).optional(),
        force: z
            .boolean()
            .optional()
            .describe(
                'Publish past a review that is not approved. Only someone with a role under `reviews.roles` may; for anyone else it changes nothing.'
            ),
    })
    .optional();

/**
 * Unpublishing takes nothing: `{}` or no body.
 */
export const UnpublishBodySchema = z.object({}).strict().optional();

export const RollbackBodySchema = Kizuna.model({
    title: 'CMS.Rollback',
    schema: z.object({
        version: z.int().min(1).describe('The version to restore as a new draft.'),
    }),
});

export const MediaSchema = Kizuna.model({
    title: 'CMS.Media',
    schema: z.object({
        id: z.string(),
        url: z.string(),
        contentType: z.string(),
        size: z.int(),
        width: z.int(),
        height: z.int(),
        filename: z.string(),
        alt: z.string().describe('The default alt text, used where a field sets none.'),
        focalPoint: FocalPointSchema.optional(),
        uploadedAt: z.string(),
        uploadedBy: z.string(),
    }),
});

export const MediaListSchema = Kizuna.model({
    title: 'CMS.MediaList',
    schema: z.object({
        media: z.array(MediaSchema),
    }),
});

export const UpdateMediaBodySchema = Kizuna.model({
    title: 'CMS.UpdateMedia',
    schema: z.object({
        alt: z.string().optional(),
        focalPoint: FocalPointSchema.optional(),
    }),
});

export const CreateUploadBodySchema = Kizuna.model({
    title: 'CMS.CreateUpload',
    schema: z.object({
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1),
        size: z.int().min(1),
    }),
});

export const UploadSchema = Kizuna.model({
    title: 'CMS.Upload',
    schema: z.object({
        uploadId: z.string(),
        url: z.string().describe('Where the browser sends the file with PUT.'),
        headers: z.record(z.string(), z.string()).describe('Headers the PUT has to carry.'),
        maxBytes: z.int(),
    }),
});

export const PreviewSchema = Kizuna.model({
    title: 'CMS.Preview',
    schema: z.object({
        token: z.string(),
        expiresIn: z.int().describe('Seconds until the token stops working.'),
    }),
});

const fractions = (count: number) =>
    z
        .string()
        .transform((value) => value.split(',').map(Number))
        .pipe(z.array(z.number().min(0).max(1)).length(count));

/**
 * What the image route takes: the field's crop and focal point as
 * comma-separated fractions, and the size wanted.
 */
export const ImageQuerySchema = z.object({
    crop: fractions(4)
        .transform(([x, y, width, height]) => ({
            x: x!,
            y: y!,
            width: width!,
            height: height!,
        }))
        .pipe(CropSchema)
        .optional(),
    focal: fractions(2)
        .transform(([x, y]) => ({
            x: x!,
            y: y!,
        }))
        .pipe(FocalPointSchema)
        .optional(),
    w: z.int().min(1).max(4096).optional().describe('The width to render at.'),
    h: z.int().min(1).max(4096).optional().describe('The height to render at; with w, the image is cropped to fit around the focal point.'),
});

export const InvalidateBodySchema = z.object({
    relationship: z.string().min(1).describe('The name of the relationship, like products.'),
    id: z.string().min(1).describe('The id of the one that changed.'),
});

export const PeopleSchema = Kizuna.model({
    title: 'CMS.People',
    schema: z.object({
        me: z.string().describe('The caller, by their id.'),
        people: z.array(PersonSchema).describe('Everyone who edits, to name as an owner or a reviewer.'),
    }),
});

export const OwnerBodySchema = Kizuna.model({
    title: 'CMS.SetOwner',
    schema: z.object({
        owner: z.string().nullable().describe('The id of the person who looks after it, from the people list, or null for nobody.'),
    }),
});

export const RequestReviewBodySchema = Kizuna.model({
    title: 'CMS.RequestReview',
    schema: z.object({
        refs: z.array(z.string()).min(1).describe('The documents to review, like page:frontPage. They are reviewed as one request.'),
        reviewers: z.array(z.string()).min(1).describe('The ids of the people to ask, from the people list.'),
        note: z.string().max(2000).optional().describe('Something for the reviewers to know.'),
    }),
});

export const DecideReviewBodySchema = Kizuna.model({
    title: 'CMS.DecideReview',
    schema: z.object({
        ids: z.array(z.string()).min(1).describe('The reviews to answer, from the waiting list.'),
        decision: z.enum(['approve', 'requestChanges']),
        note: z.string().max(2000).optional().describe('Why, or what to change.'),
    }),
});

export const WaitingReviewsSchema = Kizuna.model({
    title: 'CMS.WaitingReviews',
    schema: z.object({
        reviews: z.array(
            ReviewStateSchema.extend({
                ref: z.string(),
                label: z.string(),
                path: z.string().nullable(),
            })
        ),
    }),
});

export const ReviewListSchema = Kizuna.model({
    title: 'CMS.Reviews',
    schema: z.object({
        reviews: z.array(ReviewStateSchema),
    }),
});
