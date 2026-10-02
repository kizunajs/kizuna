import { z } from 'zod';
import { Kizuna } from 'kizunajs';
import { CropSchema, FocalPointSchema } from './image.js';

/**
 * Where a page stands: nothing saved, a draft never published, published with
 * the draft matching, or published with newer draft changes.
 */
export const PageStatusSchema = z.enum(['empty', 'draft', 'published', 'changed']);

export const PageSummarySchema = Kizuna.model({
    title: 'CmsPageSummary',
    schema: z.object({
        name: z.string(),
        path: z.string(),
        status: PageStatusSchema,
        version: z.int().describe('The latest version saved, 0 before the first.'),
        publishedVersion: z.int().nullable(),
        updatedAt: z.string().nullable(),
        updatedBy: z.string().nullable(),
    }),
});

export const PublishedPageSchema = Kizuna.model({
    title: 'CmsPublishedPage',
    schema: z.object({
        name: z.string(),
        path: z.string(),
        version: z.int(),
        content: z.record(z.string(), z.unknown()),
        updatedAt: z.string(),
    }),
});

export const DraftPageSchema = Kizuna.model({
    title: 'CmsDraftPage',
    schema: z.object({
        name: z.string(),
        path: z.string(),
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

export const DraftHeadersSchema = z.object({
    etag: z.string(),
});

export const DescribedFieldSchema = Kizuna.model({
    title: 'CmsField',
    schema: z.object({
        path: z.string().describe('The dotted path a change is keyed by.'),
        name: z.string(),
        label: z.string().optional(),
        description: z.string().optional(),
        block: z.string().optional().describe('The block slug, when the field is a block.'),
        parent: z.string().optional().describe('The path of the block field this one sits in.'),
        readOnly: z.boolean(),
        writable: z.boolean().describe('Whether the caller may write this field.'),
        roles: z.array(z.string()).optional().describe('The roles that may write it, when narrowed.'),
        brand: z.string().optional().describe('The brand of the ids this field holds.'),
        searchTool: z.string().optional().describe('The tool that finds ids for the brand.'),
        schema: z.record(z.string(), z.unknown()).describe('The JSON Schema of the value.'),
        value: z.unknown().optional().describe('The current draft value.'),
    }),
});

export const DescribedPageSchema = Kizuna.model({
    title: 'CmsDescribedPage',
    schema: z.object({
        name: z.string(),
        path: z.string(),
        url: z.string(),
        status: PageStatusSchema,
        version: z.int(),
        complete: z.boolean(),
        missing: z.array(z.string()),
        fields: z.array(DescribedFieldSchema),
        draft: z.record(z.string(), z.unknown()).nullable(),
    }),
});

export const MissingFieldsSchema = Kizuna.model({
    title: 'CmsMissingFields',
    schema: z.object({
        name: z.string(),
        complete: z.boolean(),
        missing: z.array(z.string()),
        prompt: z.string().describe('Something to ask an agent, like "Fill in the spring page."'),
    }),
});

export const VersionSchema = Kizuna.model({
    title: 'CmsVersion',
    schema: z.object({
        version: z.int(),
        summary: z.string().nullable(),
        createdAt: z.string(),
        createdBy: z.string(),
        published: z.boolean().describe('Whether this is the version readers see.'),
    }),
});

export const VersionListSchema = Kizuna.model({
    title: 'CmsVersionList',
    schema: z.object({
        name: z.string(),
        versions: z.array(VersionSchema),
    }),
});

export const WhereUsedSchema = Kizuna.model({
    title: 'CmsWhereUsed',
    schema: z.object({
        brand: z.string(),
        id: z.string(),
        pages: z.array(
            z.object({
                name: z.string(),
                path: z.string(),
                fieldPaths: z.array(z.string()),
            })
        ),
    }),
});

export const UpdateDraftBodySchema = Kizuna.model({
    title: 'CmsUpdateDraft',
    schema: z.object({
        changes: z
            .record(z.string(), z.unknown())
            .describe('New values keyed by field path, like "hero.heading". Only fields the caller may write.'),
        summary: z.string().max(200).optional().describe('What changed, in a sentence, for the history.'),
    }),
});

export const UpdateDraftHeadersSchema = z.object({
    'if-match': z.string().optional().describe('The ETag read with the draft. A stale one is refused.'),
});

export const PublishBodySchema = z
    .object({
        summary: z.string().max(200).optional(),
    })
    .optional();

export const RollbackBodySchema = Kizuna.model({
    title: 'CmsRollback',
    schema: z.object({
        version: z.int().min(1).describe('The version to restore as a new draft.'),
    }),
});

export const MediaSchema = Kizuna.model({
    title: 'CmsMedia',
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
    title: 'CmsMediaList',
    schema: z.object({
        media: z.array(MediaSchema),
    }),
});

export const UpdateMediaBodySchema = Kizuna.model({
    title: 'CmsUpdateMedia',
    schema: z.object({
        alt: z.string().optional(),
        focalPoint: FocalPointSchema.optional(),
    }),
});

export const CreateUploadBodySchema = Kizuna.model({
    title: 'CmsCreateUpload',
    schema: z.object({
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1),
        size: z.int().min(1),
    }),
});

export const UploadSchema = Kizuna.model({
    title: 'CmsUpload',
    schema: z.object({
        uploadId: z.string(),
        url: z.string().describe('Where the browser sends the file with PUT.'),
        headers: z.record(z.string(), z.string()).describe('Headers the PUT has to carry.'),
        maxBytes: z.int(),
    }),
});

export const PreviewSchema = Kizuna.model({
    title: 'CmsPreview',
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
