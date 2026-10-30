import { CmsHttpError } from './cms.js';
import { DEFAULT_SITE } from './options.js';
import { parseRef, type DocumentRef } from './refs.js';
import type { Caller } from './rules.js';

/**
 * Where one editor may go, and the role they hold on the shared content and
 * on each site they open.
 */
export class EditorAccess {
    constructor(
        /**
         * Their role on the shared content.
         */
        readonly shared: Caller,
        /**
         * Their role on each site they may open.
         */
        readonly sites: Readonly<Record<string, Caller>>,
        /**
         * Whether they publish shared content, which reaches every site.
         */
        readonly publishesShared: boolean
    ) {}

    sees(site: string | undefined): boolean {
        return site === undefined || site === DEFAULT_SITE || this.sites[site] !== undefined;
    }

    /**
     * Whether the document a ref names sits where they may go. A ref that
     * does not parse is left to the route that reads it.
     */
    seesRef(ref: DocumentRef | string): boolean {
        const parsed = typeof ref === 'string' ? parseRef(ref) : ref;
        return parsed === undefined || this.sees(parsed.site);
    }

    /**
     * Refuses a site they may not open as if it did not exist, so an editor
     * of one site never learns of another.
     */
    assertSees(site: string | undefined): void {
        if (!this.sees(site)) throw new CmsHttpError(404, { detail: `There is no site named '${site}'.` });
    }

    assertSeesRef(ref: DocumentRef): DocumentRef {
        this.assertSees(ref.site);
        return ref;
    }

    /**
     * Their role where a document is stored.
     */
    callerOn(site: string | undefined): Caller {
        this.assertSees(site);
        return site === undefined || site === DEFAULT_SITE ? this.shared : this.sites[site]!;
    }

    callerFor(ref: DocumentRef | string): Caller {
        const parsed = typeof ref === 'string' ? parseRef(ref) : ref;
        return this.callerOn(parsed?.site);
    }
}
