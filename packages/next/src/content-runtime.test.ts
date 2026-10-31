import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextContentRuntime } from './server.js';

const set = vi.fn();
const values = new Map<string, string>();

vi.mock('next/headers', () => ({
    draftMode: async () => ({
        isEnabled: false,
        enable: () => {
            values.set('__prerender_bypass', 'preview-mode-id');
        },
        disable: () => undefined,
    }),
    cookies: async () => ({
        get: (name: string) => {
            const value = values.get(name);
            return value === undefined
                ? undefined
                : {
                      name,
                      value,
                  };
        },
        set,
        delete: () => undefined,
    }),
}));

beforeEach(() => {
    set.mockClear();
    values.clear();
});

describe("Next's draft mode for content", () => {
    it("leaves Next's own cookie alone without options", async () => {
        (await nextContentRuntime.draftMode()).enable();
        expect(set).not.toHaveBeenCalled();
    });

    it('keeps draft mode inside a frame on another site, for as long as asked', async () => {
        (await nextContentRuntime.draftMode()).enable({
            maxAge: 600,
            partitioned: true,
        });
        expect(set).toHaveBeenCalledWith('__prerender_bypass', 'preview-mode-id', {
            httpOnly: true,
            path: '/',
            maxAge: 600,
            sameSite: 'none',
            secure: true,
            partitioned: true,
        });
    });
});
