/**
 * Whether an error is the one `notFound()` throws.
 */
const isNotFound = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && 'digest' in error && error.digest === 'NEXT_HTTP_ERROR_FALLBACK;404';

/**
 * A read that may find nothing, as `undefined`. A global with no published
 * content calls `notFound()`, which the root layout may not, so the header
 * and footer read through this and show less until an editor fills them.
 */
export const optional = async <Result>(read: () => Promise<Result>): Promise<Result | undefined> => {
    try {
        return await read();
    } catch (error) {
        if (isNotFound(error)) return undefined;
        throw error;
    }
};
