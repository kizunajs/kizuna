import { describe, expect, it } from 'vitest';
import { snapshotPathFor } from './snapshot.js';

describe('where a snapshot lives', () => {
    it('names the default config api', () => {
        expect(snapshotPathFor('kizuna.config.ts')).toBe('.kizuna/snapshot.yaml');
    });

    it('names a second api after the part that distinguishes it', () => {
        expect(snapshotPathFor('kizuna.admin.config.ts')).toBe('.kizuna/admin.snapshot.yaml');
        expect(snapshotPathFor('admin.config.ts')).toBe('.kizuna/admin.snapshot.yaml');
    });

    it('sits beside the config it describes', () => {
        expect(snapshotPathFor('apps/api/kizuna.config.ts')).toBe('apps/api/.kizuna/snapshot.yaml');
    });
});
