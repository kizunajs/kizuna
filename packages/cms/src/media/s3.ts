import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { MediaStorage } from './storage.js';

/**
 * Where uploads go: any S3-compatible store. AWS needs a `region`; Supabase
 * Storage, Cloudflare R2, MinIO and the rest take their `endpoint`.
 */
export interface S3Options {
    bucket: string;
    /**
     * `auto` for R2, the project's region for Supabase, the bucket's for AWS.
     *
     * @default 'auto'
     */
    region?: string;
    /**
     * The store's S3 endpoint, such as
     * `https://<project>.storage.supabase.co/storage/v1/s3`. Leave it out for
     * AWS.
     */
    endpoint?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    /**
     * Address objects as `endpoint/bucket/key`, which every store but AWS
     * wants.
     *
     * @default true when `endpoint` is set
     */
    forcePathStyle?: boolean;
    /**
     * A client of your own, when the options above are not enough.
     */
    client?: S3Client;
}

const toBytes = async (body: unknown): Promise<Uint8Array> => {
    if (body === undefined || body === null) return new Uint8Array();
    const stream = body as { transformToByteArray?: () => Promise<Uint8Array> };
    if (typeof stream.transformToByteArray === 'function') return stream.transformToByteArray();
    return new Uint8Array(await new Response(body as BodyInit).arrayBuffer());
};

/**
 * Media kept in an S3 bucket through the AWS SDK, which speaks to every
 * S3-compatible store. Files are read through the CMS's own image route, so the
 * bucket can stay private.
 */
export const s3MediaStorage = (options: S3Options): MediaStorage => {
    const client =
        options.client ??
        new S3Client({
            region: options.region ?? 'auto',
            ...(options.endpoint === undefined ? {} : { endpoint: options.endpoint }),
            forcePathStyle: options.forcePathStyle ?? options.endpoint !== undefined,
            ...(options.accessKeyId === undefined || options.secretAccessKey === undefined
                ? {}
                : {
                      credentials: {
                          accessKeyId: options.accessKeyId,
                          secretAccessKey: options.secretAccessKey,
                      },
                  }),
        });
    const Bucket = options.bucket;

    return {
        presignUpload: async ({ key, contentType, size, expiresIn }) => ({
            url: await getSignedUrl(
                client,
                new PutObjectCommand({
                    Bucket,
                    Key: key,
                    ContentType: contentType,
                    ContentLength: size,
                }),
                {
                    expiresIn,
                }
            ),
            headers: {
                'content-type': contentType,
            },
        }),
        head: async (key) => {
            try {
                const head = await client.send(
                    new HeadObjectCommand({
                        Bucket,
                        Key: key,
                    })
                );
                return {
                    size: head.ContentLength ?? 0,
                    contentType: head.ContentType,
                };
            } catch (error) {
                if (
                    (error as { name?: string }).name === 'NotFound' ||
                    (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
                ) {
                    return undefined;
                }
                throw error;
            }
        },
        get: async (key) => {
            try {
                const object = await client.send(
                    new GetObjectCommand({
                        Bucket,
                        Key: key,
                    })
                );
                return toBytes(object.Body);
            } catch (error) {
                if ((error as { name?: string }).name === 'NoSuchKey') return undefined;
                throw error;
            }
        },
        put: async (key, bytes, contentType) => {
            await client.send(
                new PutObjectCommand({
                    Bucket,
                    Key: key,
                    Body: bytes,
                    ContentType: contentType,
                })
            );
        },
        delete: async (key) => {
            await client.send(
                new DeleteObjectCommand({
                    Bucket,
                    Key: key,
                })
            );
        },
    };
};
