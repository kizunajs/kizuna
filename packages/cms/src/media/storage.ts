/**
 * What the CMS asks of the place files live. S3 through the AWS SDK is the
 * shipped implementation; tests and demos use the in-memory one. Files are
 * served through the CMS image route, never from here directly.
 */
export interface MediaStorage {
    /**
     * A URL the browser sends the file to with PUT, and the headers it has to
     * carry.
     */
    presignUpload(input: { key: string; contentType: string; size: number; expiresIn: number }): Promise<{
        url: string;
        headers: Record<string, string>;
    }>;
    head(key: string): Promise<{ size: number; contentType: string | undefined } | undefined>;
    get(key: string): Promise<Uint8Array | undefined>;
    put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
    delete(key: string): Promise<void>;
}

/**
 * Files kept in memory, for tests and demos. The presigned URL points at
 * `uploadBase`, so a demo can accept the PUT on a route of its own, or a test
 * can write the bytes straight into `files`.
 */
export const memoryMediaStorage = (
    uploadBase = 'memory://uploads'
): MediaStorage & { files: Map<string, { bytes: Uint8Array; contentType: string }> } => {
    const files = new Map<string, { bytes: Uint8Array; contentType: string }>();
    return {
        files,
        presignUpload: async ({ key, contentType }) => ({
            url: `${uploadBase}/${key}`,
            headers: {
                'content-type': contentType,
            },
        }),
        head: async (key) => {
            const file = files.get(key);
            return file === undefined
                ? undefined
                : {
                      size: file.bytes.byteLength,
                      contentType: file.contentType,
                  };
        },
        get: async (key) => files.get(key)?.bytes,
        put: async (key, bytes, contentType) => {
            files.set(key, {
                bytes,
                contentType,
            });
        },
        delete: async (key) => {
            files.delete(key);
        },
    };
};
