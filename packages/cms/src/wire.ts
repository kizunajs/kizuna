import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { ProblemDetailsSchema } from 'kizunajs/schemas';
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

export const CollectionPageSchema = Kizuna.model({
    title: 'CMS.CollectionPage',
    schema: z.object({
        site: z.string().describe('The site the route belongs to, default unless several apps share the CMS.'),
        name: z.string(),
        label: z.string().nullable().describe('What editors call the page, when it declares a label.'),
        path: z.string().describe('The route, with a param per address field, like /shops/[slug].'),
        collection: z.string().describe('The collection whose items the route shows, one per address.'),
    }),
});

/**
 * An item's place in an orderable collection: a fractional key, sorting in
 * the order editors gave the items. `keyBetween` from `@kizunajs/cms/keys`
 * makes one between two others, and the Swift and Kotlin clients emit
 * `FractionalKey` for the same.
 */
export const PlaceSchema = z.string().meta({
    fractionalKey: true,
    description: "The item's place among the others, a key that sorts in their order.",
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
        place: PlaceSchema.optional().describe(
            'Its place, a key that sorts in the order editors gave the items. Only in an orderable collection.'
        ),
        values: z
            .record(z.string(), z.unknown())
            .optional()
            .describe('The fields `fields` names, as stored. Only when the list is asked for fields.'),
        labels: z
            .record(z.string(), z.string())
            .optional()
            .describe('What an editor reads for the fields of `values` holding a choice or an id, like "Plant care" for care.'),
    }),
});

export const PlaceItemBodySchema = z.object({
    after: z.string().optional().describe('Right after this item, as its sibling under the same parent.'),
    before: z.string().optional().describe('Right before this item, as its sibling under the same parent.'),
    at: z.enum(['first', 'last']).optional().describe('First or last among its siblings.'),
    parent: z
        .string()
        .nullable()
        .optional()
        .describe('In a tree, the item it goes under, null for the top. Alone or with `at`; left out, it keeps its parent.'),
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

export const DraftScheduleSchema = z
    .object({
        action: z.enum(['publish', 'unpublish']),
        at: z.iso.datetime().nullable().describe('When it runs, in UTC. Null in a release that has no time yet.'),
        release: z
            .object({
                id: z.string(),
                name: z.string(),
            })
            .nullable()
            .describe('The release it publishes with, or null when it is scheduled on its own.'),
        by: z.string().describe('Who set the time, by their id.'),
    })
    .nullable()
    .describe('When the document publishes or unpublishes without anyone pressing Publish. Null when nothing is scheduled.');

const HeldBySchema = z
    .string()
    .nullable()
    .describe(
        'Who edits the document now. One person edits a document at a time: a write from anyone else answers 409 until they stop, or two minutes after their last save. Null when nobody does.'
    );

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
        heldBy: HeldBySchema,
        schedule: DraftScheduleSchema,
        place: PlaceSchema.optional().describe("An item's place, in an orderable collection, once it has one."),
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

const ConditionValueSchema = z.union([z.string(), z.number(), z.boolean()]);

export const FieldConditionSchema = Kizuna.model({
    title: 'CMS.FieldCondition',
    schema: z
        .object({
            field: z.string().describe('The field beside it whose value decides, in the same page, block or item.'),
            is: z
                .union([ConditionValueSchema, z.array(ConditionValueSchema)])
                .optional()
                .describe('Shown while that field holds the value, or one of the values. A list holds it when it contains it.'),
            isNot: z
                .union([ConditionValueSchema, z.array(ConditionValueSchema)])
                .optional()
                .describe('Shown while that field holds none of the values.'),
        })
        .describe('When the field shows. A hidden field never holds up publishing, and a value it holds is kept.'),
});

export const DescribedBlockSchema = Kizuna.model({
    title: 'CMS.Block',
    schema: z.object({
        name: z.string().describe('What an item of the list stores under its block key.'),
        label: z.string().optional().describe('What editors see the block called.'),
        description: z.string().optional().describe('What the block is for, read when choosing one.'),
        fields: z
            .array(
                z.object({
                    name: z.string(),
                    label: z.string().optional(),
                    options: z.record(z.string(), z.string()).optional().describe('For an enum, the label editors see for each value.'),
                    description: z.string().optional(),
                    required: z.boolean().describe('Whether the item needs a value here, while the field shows.'),
                    condition: FieldConditionSchema.optional(),
                })
            )
            .describe("The block's fields, in the order editors see them, named as the item holds them."),
    }),
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
        blocks: z
            .array(DescribedBlockSchema)
            .optional()
            .describe(
                "For a list of blocks, the blocks an item may be. Each item names its block under 'block', beside that block's fields. For rich text, the blocks it may hold, each a node naming its block under '_type'."
            ),
        parent: z.string().optional().describe('The path of the block field this one sits in.'),
        position: z.enum(['sidebar']).optional().describe('Where the editor shows it, when beside the main column.'),
        width: z.string().optional().describe('How much of a row it takes, like 50%.'),
        layout: z
            .array(z.string())
            .optional()
            .describe('The ids of the tabs, rows and collapsibles it sits in, outermost first, from the layout list.'),
        readOnly: z.boolean(),
        required: z.boolean().describe('Whether the document needs a value here before it can publish, while the field shows.'),
        condition: FieldConditionSchema.optional(),
        hidden: z
            .boolean()
            .optional()
            .describe('True when the condition hides the field in the current draft, so publishing does not need it.'),
        writable: z.boolean().describe('Whether the caller may write this field.'),
        roles: z.array(z.string()).optional().describe('The roles that may write it, when narrowed.'),
        brand: z.string().optional().describe('The brand of the ids this field holds, when a collection or relationship holds them.'),
        searchTool: z.string().optional().describe('The tool that finds ids for the brand.'),
        schema: z.record(z.string(), z.unknown()).describe('The JSON Schema of the value.'),
        value: z.unknown().optional().describe('The current draft value.'),
        belongsTo: z
            .string()
            .optional()
            .describe("Whose value this is, when the CMS serves several sites: 'Shared', or the label of the site that sets it."),
        sharedValue: z.unknown().optional().describe('The shared value, which the site shows while it sets none of its own.'),
        translated: z.boolean().optional().describe('True for a field each language holds its own value of.'),
        sourceValue: z.unknown().optional().describe("In a translation, the source's value, which the field says in its own language."),
        sourceChanged: z
            .boolean()
            .optional()
            .describe(
                'In a translation, true when the source changed since the field was translated. Update the field, or keep it as it is.'
            ),
        sourceBefore: z.unknown().optional().describe('For a field whose source changed, the source value it was translated from.'),
    }),
});

export const KeepSourceBodySchema = z.object({
    fields: z
        .array(z.string())
        .min(1)
        .describe('The translated fields to keep as they are, by name, from the fields whose `sourceChanged` is true.'),
});

export const DocumentLocalesSchema = z
    .object({
        current: z.string().describe('The language this copy is in.'),
        source: z.string().describe('The language of the source, which every other language translates.'),
        locales: z.array(
            z.object({
                code: z.string(),
                status: PageStatusSchema,
                sourceChanged: z.int().describe('How many of its fields changed in the source since they were translated or kept.'),
                changed: z.array(z.string()).describe('The fields whose source changed since they were translated or kept.'),
                missing: z.array(z.string()).describe('The translated fields the source holds and this language leaves empty.'),
            })
        ),
        translate: z.boolean().optional().describe("True when the translate tool drafts a language from the source's published text."),
    })
    .describe(
        "The languages the document is written in. Describe `<ref>@<code>` to work on one, and pass that `locale` to the editing tools. A translation's fields carry the source's text as `sourceValue`."
    );

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
        partners: z
            .array(
                z.object({
                    key: z.string(),
                    label: z.string(),
                })
            )
            .describe('The partners that read it, which a publish refreshes too.'),
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

export const ReviewCommentSchema = Kizuna.model({
    title: 'CMS.ReviewComment',
    schema: z.object({
        id: z.string(),
        path: z.string().describe('The field it is about, as a change to it is keyed.'),
        text: z.string(),
        by: PersonSchema,
        createdAt: z.iso.datetime(),
        resolvedBy: PersonSchema.nullable().describe('Who resolved it, or null while it is open.'),
        resolvedAt: z.iso.datetime().nullable(),
    }),
});

export const ReviewStateSchema = Kizuna.model({
    title: 'CMS.ReviewState',
    schema: z.object({
        id: z.string(),
        status: z
            .enum(['open', 'approved', 'changes', 'outdated', 'withdrawn', 'published-past-review'])
            .describe(
                'Waiting for an answer, approved, sent back with changes to make, approved before the draft changed again, taken back by the person who asked, or published before anyone approved it. `decidedBy` names who did the last.'
            ),
        version: z.int().describe('The draft version it was asked about, or the one the reviewer answered.'),
        reviewers: z.array(PersonSchema),
        requestedBy: PersonSchema,
        note: z.string().nullable(),
        createdAt: z.iso.datetime(),
        decidedBy: PersonSchema.nullable(),
        decisionNote: z.string().nullable(),
        decidedAt: z.iso.datetime().nullable(),
        comments: z
            .array(ReviewCommentSchema)
            .describe(
                'Comments on single fields, on this review and the earlier ones since the document was last published, oldest first.'
            ),
    }),
});

/**
 * Who looks after a document, and where its review stands.
 */
const ReviewFields = {
    owner: PersonSchema.nullable().describe('The person who looks after it, if anyone does.'),
    review: ReviewStateSchema.nullable().describe('Its latest review since it was last published.'),
    requireReview: z.boolean().describe('Whether publishing waits for an approval.'),
    canPublish: z
        .boolean()
        .describe('Whether the caller may publish it. Shared content, on a CMS with sites, takes an admin over every site.'),
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
                "The page the Live Preview opens on: an item's `preview.url`, where the document is served, or the first page that shows it. Null when no page shows it."
            ),
        usedOn: UsedOnSchema,
        status: PageStatusSchema,
        version: z.int(),
        complete: z.boolean(),
        missing: z.array(z.string()),
        heldBy: HeldBySchema,
        schedule: DraftScheduleSchema,
        fields: z.array(DescribedFieldSchema),
        layout: z
            .array(DescribedLayoutSchema)
            .describe(
                'The tabs, rows and collapsibles that arrange the fields, in the order they are shown. Empty when the fields are listed plainly.'
            ),
        draft: z.record(z.string(), z.unknown()).nullable(),
        actions: z.array(AvailableActionSchema).optional().describe("For an item, the buttons its collection's actions show the caller."),
        locale: DocumentLocalesSchema.optional(),
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
        review: z
            .object({
                status: z.enum(['approved', 'published-past-review']),
                by: PersonSchema,
                at: z.iso.datetime(),
            })
            .nullable()
            .describe('Who approved this version, or who published it before anyone approved it.'),
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

const mediaFields = {
    id: z.string(),
    url: z.string(),
    contentType: z.string(),
    size: z.int(),
    width: z.int(),
    height: z.int(),
    filename: z.string(),
    alt: z.string().describe('The default alt text, used where a field sets none.'),
    focalPoint: FocalPointSchema.optional().describe('The default focal point, used where a field sets none.'),
    uploadedAt: z.string(),
    uploadedBy: z.string(),
    site: z.string().optional().describe('The site the image belongs to. Left out for a shared image, which any site may show.'),
    folder: z.string().optional().describe('The folder of its library the image sits in. Left out at the top level.'),
};

export const MediaSchema = Kizuna.model({
    title: 'CMS.Media',
    schema: z.object(mediaFields),
});

export const MediaSummarySchema = Kizuna.model({
    title: 'CMS.MediaSummary',
    schema: z.object({
        ...mediaFields,
        uses: z.int().describe('How many pages, globals and items hold it, published or in a draft.'),
    }),
});

export const MediaFolderSchema = Kizuna.model({
    title: 'CMS.MediaFolder',
    schema: z.object({
        id: z.string(),
        name: z.string(),
        parent: z.string().optional().describe('The folder it sits in. Left out at the top level.'),
        site: z.string().optional().describe('The site whose library holds it. Left out in the shared library.'),
        images: z.int().describe('How many images it holds itself, not counting its folders.'),
    }),
});

export const MediaListSchema = Kizuna.model({
    title: 'CMS.MediaList',
    schema: z.object({
        media: z.array(MediaSummarySchema),
        folders: z.array(MediaFolderSchema).describe("The library's folders, and with `site` the shared ones beside them."),
        maxBytes: z.int().describe('The largest file an upload accepts.'),
    }),
});

export const MediaUseSchema = Kizuna.model({
    title: 'CMS.MediaUse',
    schema: z.object({
        ref: z.string().describe('The document holding the image, like page:frontPage or item:articles:k3j9x2.'),
        site: z.string().optional().describe('The site the document belongs to. Left out for shared content.'),
        label: z.string().nullable().describe("An item's title, or the page's or global's label."),
        locales: z.array(z.string()).describe('The languages the document shows the image in.'),
        fieldPaths: z.array(z.string()).describe('The fields holding it, as dotted paths.'),
        published: z.boolean().describe('Whether the published content shows it. False when only the draft holds it.'),
    }),
});

export const MediaUsesSchema = Kizuna.model({
    title: 'CMS.MediaUses',
    schema: z.object({
        id: z.string(),
        uses: z.array(MediaUseSchema),
        elsewhere: z.int().describe('How many more documents hold it in sites the caller does not edit.'),
    }),
});

/**
 * A media change refused because documents hold the image: a delete, or a
 * move into a site while content outside it holds the image.
 */
export const MediaHeldSchema = Kizuna.model({
    title: 'CMS.MediaHeld',
    schema: ProblemDetailsSchema.extend({
        uses: z.array(MediaUseSchema).describe('The documents holding it, that stop the change.'),
    }),
});

const folderName = z.string().trim().min(1).max(60);

export const CreateMediaFolderBodySchema = Kizuna.model({
    title: 'CMS.CreateMediaFolder',
    schema: z.object({
        name: folderName,
        parent: z.string().optional().describe('The folder to make it in. Leave it out for the top level.'),
    }),
});

export const UpdateMediaFolderBodySchema = Kizuna.model({
    title: 'CMS.UpdateMediaFolder',
    schema: z.object({
        name: folderName.optional(),
        parent: z.string().nullable().optional().describe('The folder to move it into. `null` moves it to the top level.'),
    }),
});

export const MoveMediaBodySchema = Kizuna.model({
    title: 'CMS.MoveMedia',
    schema: z.object({
        ids: z.array(z.string()).min(1).max(100).describe('The images to move.'),
        site: z.string().optional().describe('The library they move into. Leave it out for the shared library.'),
        folder: z.string().optional().describe('A folder of that library. Leave it out for its top level.'),
    }),
});

export const MovedMediaSchema = Kizuna.model({
    title: 'CMS.MovedMedia',
    schema: z.object({
        media: z.array(MediaSchema),
    }),
});

export const CompleteUploadBodySchema = z
    .object({
        folder: z.string().optional().describe('The folder of the library the image lands in. Leave it out for the top level.'),
    })
    .optional();

export const UpdateMediaBodySchema = Kizuna.model({
    title: 'CMS.UpdateMedia',
    schema: z.object({
        alt: z.string().optional(),
        focalPoint: FocalPointSchema.nullable()
            .optional()
            .describe('The default focal point, used where a field sets none. `null` clears it.'),
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

export const InvalidateBodySchema = z.union([
    z
        .object({
            brand: z.string().min(1).describe("The brand of the id, like 'ProductId'."),
            id: z.string().min(1).describe('The id of the one that changed.'),
        })
        .strict(),
    z
        .object({
            global: z.string().min(1).describe("The global that changed, like 'header'."),
        })
        .strict(),
    z
        .object({
            page: z.string().min(1).describe("The page that changed, like 'frontPage'."),
        })
        .strict(),
]);

/**
 * What one refresh calls a site's or a partner's `invalidate` with.
 */
export type InvalidateBody = z.output<typeof InvalidateBodySchema>;

export const RefreshListSchema = Kizuna.model({
    title: 'CMS.Refreshes',
    schema: z.object({
        refreshes: z.array(
            z.object({
                target: z.string().describe('The site or partner, by its key.'),
                kind: z.enum(['site', 'partner']),
                label: z.string(),
                status: z
                    .enum(['queued', 'answered', 'retrying', 'failed'])
                    .describe('`retrying` failed and waits for another attempt; `failed` will not be tried again.'),
                attempts: z.int(),
                updatedAt: z.iso.datetime(),
            })
        ),
    }),
});

export const PeopleSchema = Kizuna.model({
    title: 'CMS.People',
    schema: z.object({
        me: z.string().describe('The caller, by their id.'),
        people: z
            .array(
                PersonSchema.extend({
                    email: z.string().optional().describe('Their email, when the app gives one.'),
                    roles: z.array(z.string()).optional().describe('Their roles, as the app gives them.'),
                    sites: z
                        .record(z.string(), z.array(z.string()))
                        .optional()
                        .describe('Their roles on each site you may open, like `{ uk: ["editor"] }`. Left out without sites.'),
                })
            )
            .describe('Everyone who edits, to name as an owner or a reviewer.'),
        manage: z
            .object({
                sites: z.array(z.string()).describe('The sites you may invite people to and change their roles on.'),
                roles: z.array(z.string()).describe('The roles a person may hold on a site.'),
                invite: z.boolean().describe('Whether the app adds the people you invite.'),
                change: z.boolean().describe("Whether the app stores changes to people's roles."),
            })
            .optional()
            .describe('What you may change about people. Left out without sites.'),
    }),
});

export const InvitePersonBodySchema = Kizuna.model({
    title: 'CMS.InvitePerson',
    schema: z.object({
        email: z.email(),
        sites: z.record(z.string(), z.string()).describe('The role they hold on each site, like `{ uk: "editor" }`.'),
    }),
});

export const InvitedPersonSchema = Kizuna.model({
    title: 'CMS.InvitedPerson',
    schema: z.object({
        id: z.string().describe('Their id in the people list.'),
        link: z.string().optional().describe('A link that signs them in, to send them, when the app sends no email of its own.'),
    }),
});

export const ChangePersonBodySchema = Kizuna.model({
    title: 'CMS.ChangePerson',
    schema: z.object({
        sites: z
            .record(z.string(), z.string().nullable())
            .describe('A new role on each site named, or null to take that site away. Sites left out keep their role.'),
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

export const ReviewIdsBodySchema = Kizuna.model({
    title: 'CMS.ReviewIds',
    schema: z.object({
        ids: z.array(z.string()).min(1).describe('The reviews, by their id.'),
    }),
});

export const CommentBodySchema = Kizuna.model({
    title: 'CMS.AddReviewComment',
    schema: z.object({
        review: z.string().describe("The review's id, from the document's `review`."),
        path: z.string().min(1).describe('The field to comment on, as a change to it is keyed, like hero.heading.'),
        text: z.string().trim().min(1).max(2000),
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

export const WaitingTranslationsSchema = Kizuna.model({
    title: 'CMS.WaitingTranslations',
    schema: z.object({
        translations: z.array(
            z.object({
                ref: z.string().describe('The translation, like page:norway:frontPage@en.'),
                source: z.string().describe('The document it translates.'),
                locale: z.string(),
                label: z.string(),
                changed: z.array(z.string()).describe('The fields whose source changed since they were translated or kept.'),
                missing: z.array(z.string()).describe('The fields its source has a value for and it has none.'),
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

export const ScheduleBodySchema = z.object({
    action: z.enum(['publish', 'unpublish']).default('publish'),
    at: z.iso
        .datetime({
            offset: true,
        })
        .describe('When to publish or unpublish, with its offset, like 2026-11-14T09:00:00+01:00.'),
    force: z
        .boolean()
        .optional()
        .describe(
            'Publish past a review that is not approved when the time comes. Only someone with a role under `reviews.roles` may; for anyone else it changes nothing.'
        ),
});

const ScheduleStateSchema = z
    .enum(['scheduled', 'waiting', 'held', 'late'])
    .describe(
        '`scheduled`: it runs at its time. `waiting`: something would stop it if it ran now. `held`: its time passed and something stops it, so it runs once that clears. `late`: its time passed and the job has not run yet.'
    );

export const ScheduleSchema = Kizuna.model({
    title: 'CMS.Schedule',
    schema: z.object({
        id: z.string(),
        ref: z.string(),
        title: z.string(),
        kind: z.string().describe('What it is, like Pages or Articles.'),
        site: z.string().nullable().describe('The site it belongs to, or null for shared content.'),
        action: z.enum(['publish', 'unpublish']),
        at: z.iso.datetime().nullable().describe('When it runs, in UTC. Null in a release that has no time yet.'),
        release: z
            .object({
                id: z.string(),
                name: z.string(),
            })
            .nullable(),
        state: ScheduleStateSchema,
        waitingFor: z.string().nullable().describe('What stops it, like "Nils Aas to approve" or "Intro".'),
        scheduledBy: PersonSchema,
        createdAt: z.iso.datetime(),
    }),
});

export const ReleaseSchema = Kizuna.model({
    title: 'CMS.Release',
    schema: z.object({
        id: z.string(),
        name: z.string(),
        at: z.iso.datetime().nullable().describe('When it publishes, in UTC. Null until someone schedules it.'),
        state: z.enum(['open', 'scheduled', 'waiting', 'held', 'late', 'published']),
        waiting: z.int().describe('How many of its documents would stop it if it ran now.'),
        documents: z.array(ScheduleSchema).describe('Its documents that you may open.'),
        mayPublish: z.boolean().describe('Whether you may schedule or publish it: you may publish every document in it.'),
        createdBy: PersonSchema,
        createdAt: z.iso.datetime(),
        scheduledBy: PersonSchema.nullable(),
        publishedAt: z.iso.datetime().nullable(),
        publishedBy: PersonSchema.nullable(),
    }),
});

export const ScheduledSchema = Kizuna.model({
    title: 'CMS.Scheduled',
    schema: z.object({
        schedules: z.array(ScheduleSchema).describe('Documents scheduled on their own, soonest first.'),
        releases: z.array(ReleaseSchema).describe('The releases that have not published yet, soonest first.'),
    }),
});

export const CreateReleaseBodySchema = z.object({
    name: z.string().trim().min(1).max(80),
    refs: z.array(z.string()).default([]).describe('Documents to put in it, by ref.'),
});

export const RenameReleaseBodySchema = z.object({
    name: z.string().trim().min(1).max(80),
});

export const ReleaseRefsBodySchema = z.object({
    refs: z.array(z.string()).min(1).describe('The documents, by ref.'),
});

export const ReleaseScheduleBodySchema = z.object({
    at: z.iso.datetime({
        offset: true,
    }),
    force: z
        .boolean()
        .optional()
        .describe('Publish past reviews that are not approved. Only someone with a role under `reviews.roles` may.'),
});

export const ReleasePublishBodySchema = z
    .object({
        force: z
            .boolean()
            .optional()
            .describe('Publish past reviews that are not approved. Only someone with a role under `reviews.roles` may.'),
    })
    .optional();

export const DraftCandidatesSchema = Kizuna.model({
    title: 'CMS.DraftCandidates',
    schema: z.object({
        drafts: z.array(
            z.object({
                ref: z.string(),
                title: z.string(),
                kind: z.string().describe('What it is, like Pages or Articles.'),
                site: z.string().nullable().describe('The site it belongs to, or null for shared content.'),
                updatedAt: z.iso.datetime(),
                updatedBy: PersonSchema,
                scheduled: z.boolean().describe('Whether it is scheduled already, on its own or in a release.'),
            })
        ),
    }),
});
