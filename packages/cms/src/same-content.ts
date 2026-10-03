/**
 * Whether two stored values hold the same content. Key order does not count,
 * since a value read through its schema comes back in the schema's order, and
 * a missing value equals `null`.
 */
export const sameContent = (left: unknown, right: unknown): boolean => {
    if (left === undefined || left === null || right === undefined || right === null) {
        return (left ?? null) === (right ?? null);
    }
    if (Array.isArray(left) || Array.isArray(right)) {
        return (
            Array.isArray(left) &&
            Array.isArray(right) &&
            left.length === right.length &&
            left.every((item, index) => sameContent(item, right[index]))
        );
    }
    if (typeof left === 'object' && typeof right === 'object') {
        const leftRecord = left as Record<string, unknown>;
        const rightRecord = right as Record<string, unknown>;
        const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);
        for (const key of keys) if (!sameContent(leftRecord[key], rightRecord[key])) return false;
        return true;
    }
    return left === right;
};
