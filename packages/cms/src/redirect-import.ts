import type { CmsService } from './cms.js';
import { planRedirect, type PlannedRedirect } from './redirect-edits.js';
import { localeOfPath, pageLiveAt } from './redirect-routes.js';
import type { RedirectStatus, RedirectTarget } from './storage/redirect-store.js';

/**
 * Reading a CSV of redirects for `kizuna cms import-redirects`, and planning
 * which rows to write. The header names the columns `from`, `to` and,
 * optionally, `status`, in any order.
 */

/**
 * A CSV the import cannot read at all.
 */
export class CsvError extends Error {}

/**
 * One row of the CSV, its addresses as they will be stored.
 */
export interface ImportRow {
    /**
     * The line the row starts on, counting the header as line 1.
     */
    line: number;
    from: string;
    to: string;
    status: RedirectStatus;
}

export type SkipReason = 'invalid' | 'duplicate' | 'redirects' | 'live' | 'loop';

export interface SkippedRow {
    line: number;
    from: string;
    to: string;
    reason: SkipReason;
    detail: string;
}

/**
 * A row whose `to` was another row's `from`, written to where that row goes
 * so no redirect leads to another.
 */
export interface CollapsedRow {
    line: number;
    from: string;
    to: string;
    target: string;
}

/**
 * Splits CSV text into records of fields, as RFC 4180 writes them: a field
 * in double quotes may hold commas, line breaks and `""` for a quote. Lines
 * may end in CRLF or LF, a byte order mark is dropped, and blank lines are
 * skipped. Each record carries the line it starts on.
 */
export const parseCsv = (text: string): Array<{ line: number; fields: string[] }> => {
    const source = text.startsWith('﻿') ? text.slice(1) : text;
    const records: Array<{ line: number; fields: string[] }> = [];
    let fields: string[] = [];
    let field = '';
    let quoted = false;
    let line = 1;
    let recordLine = 1;
    let touched = false;
    const endRecord = (): void => {
        fields.push(field);
        if (touched || fields.length > 1 || field !== '') {
            records.push({
                line: recordLine,
                fields,
            });
        }
        fields = [];
        field = '';
        touched = false;
    };
    for (let index = 0; index < source.length; index += 1) {
        const character = source[index]!;
        if (quoted) {
            if (character === '"') {
                if (source[index + 1] === '"') {
                    field += '"';
                    index += 1;
                } else {
                    quoted = false;
                }
            } else {
                if (character === '\n') line += 1;
                field += character;
            }
            continue;
        }
        if (character === '"') {
            quoted = true;
            touched = true;
        } else if (character === ',') {
            fields.push(field);
            field = '';
        } else if (character === '\r' && source[index + 1] === '\n') {
            continue;
        } else if (character === '\n') {
            endRecord();
            line += 1;
            recordLine = line;
        } else {
            field += character;
        }
    }
    if (quoted) throw new CsvError(`The quote opened on line ${recordLine} is never closed.`);
    endRecord();
    return records;
};

const ORIGIN = 'http://redirect.invalid';

const withoutTrailingSlash = (pathname: string): string => (pathname.length > 1 ? pathname.replace(/\/+$/, '') || '/' : pathname);

/**
 * The address a `from` cell names, as a request asks for it: a path with its
 * query, never a trailing slash or a fragment. A full URL of the old site
 * keeps only its path and query.
 */
export const importedFrom = (value: string): string | undefined => {
    if (!value.startsWith('/') && !/^https?:\/\//i.test(value)) return undefined;
    if (value.startsWith('//')) return undefined;
    let url: URL;
    try {
        url = new URL(value, ORIGIN);
    } catch {
        return undefined;
    }
    return `${withoutTrailingSlash(url.pathname)}${url.search}`;
};

/**
 * Where a `to` cell sends visitors: a path on the same site, without a
 * trailing slash, or a URL elsewhere, kept as written.
 */
export const importedTo = (value: string): string | undefined => {
    if (/^https?:\/\//i.test(value)) {
        try {
            new URL(value);
            return value;
        } catch {
            return undefined;
        }
    }
    if (!value.startsWith('/') || value.startsWith('//')) return undefined;
    let url: URL;
    try {
        url = new URL(value, ORIGIN);
    } catch {
        return undefined;
    }
    return `${withoutTrailingSlash(url.pathname)}${url.search}${url.hash}`;
};

const statusOf = (value: string): RedirectStatus | undefined => {
    switch (value) {
        case '':
        case '301':
        case '308':
            return 308;
        case '302':
        case '307':
            return 307;
        default:
            return undefined;
    }
};

/**
 * The rows of a redirects CSV, and the ones it cannot read. A row repeating
 * an earlier row's `from` is skipped as a duplicate.
 */
export const readRedirectCsv = (text: string): { rows: ImportRow[]; skipped: SkippedRow[] } => {
    const [header, ...records] = parseCsv(text);
    if (header === undefined) throw new CsvError('The file is empty. Its first line names the columns: from,to,status.');
    const columns = header.fields.map((name) => name.trim().toLowerCase());
    const fromColumn = columns.indexOf('from');
    const toColumn = columns.indexOf('to');
    const statusColumn = columns.indexOf('status');
    if (fromColumn === -1 || toColumn === -1) {
        throw new CsvError(`The first line names the columns, and needs from and to: from,to,status. It reads ${header.fields.join(',')}.`);
    }
    const rows: ImportRow[] = [];
    const skipped: SkippedRow[] = [];
    const seen = new Map<string, number>();
    for (const record of records) {
        const fromCell = (record.fields[fromColumn] ?? '').trim();
        const toCell = (record.fields[toColumn] ?? '').trim();
        const statusCell = statusColumn === -1 ? '' : (record.fields[statusColumn] ?? '').trim();
        const skip = (reason: SkipReason, detail: string): void => {
            skipped.push({
                line: record.line,
                from: fromCell,
                to: toCell,
                reason,
                detail,
            });
        };
        const from = importedFrom(fromCell);
        if (from === undefined) {
            skip('invalid', 'from is not a path or a URL.');
            continue;
        }
        const to = importedTo(toCell);
        if (to === undefined) {
            skip('invalid', 'to is not a path or a URL.');
            continue;
        }
        const status = statusOf(statusCell);
        if (status === undefined) {
            skip('invalid', `status ${statusCell} is not 307 or 308.`);
            continue;
        }
        const earlier = seen.get(from);
        if (earlier !== undefined) {
            skip('duplicate', `line ${earlier} redirects ${from} already.`);
            continue;
        }
        if (to === from) {
            skip('loop', 'to is the same address as from.');
            continue;
        }
        seen.set(from, record.line);
        rows.push({
            line: record.line,
            from,
            to,
            status,
        });
    }
    return {
        rows,
        skipped,
    };
};

/**
 * Points each row whose `to` is another row's `from` at where that row
 * finally goes, so no imported redirect leads to another. Rows that lead
 * around in a circle are skipped.
 */
export const collapseRows = (rows: readonly ImportRow[]): { rows: ImportRow[]; collapsed: CollapsedRow[]; skipped: SkippedRow[] } => {
    const byFrom = new Map(rows.map((row) => [row.from, row]));
    const written: ImportRow[] = [];
    const collapsed: CollapsedRow[] = [];
    const skipped: SkippedRow[] = [];
    for (const row of rows) {
        const visited = new Set([row.from]);
        let target = row.to;
        let next = byFrom.get(target);
        let loops = false;
        while (next !== undefined) {
            if (visited.has(next.from)) {
                loops = true;
                break;
            }
            visited.add(next.from);
            target = next.to;
            next = byFrom.get(target);
        }
        if (loops) {
            skipped.push({
                line: row.line,
                from: row.from,
                to: row.to,
                reason: 'loop',
                detail: 'its rows lead back to an address they started from.',
            });
            continue;
        }
        if (target !== row.to) {
            collapsed.push({
                line: row.line,
                from: row.from,
                to: row.to,
                target,
            });
        }
        written.push({
            ...row,
            to: target,
        });
    }
    return {
        rows: written,
        collapsed,
        skipped,
    };
};

/**
 * What an import wrote, or would write with `dryRun`, and what it left out.
 */
export interface ImportResult {
    site: string;
    dryRun: boolean;
    written: ImportRow[];
    skipped: SkippedRow[];
    collapsed: CollapsedRow[];
}

const targetOfImported = (to: string): RedirectTarget =>
    to.startsWith('/')
        ? {
              type: 'path',
              path: to,
          }
        : {
              type: 'url',
              url: to,
          };

const shownTarget = (to: RedirectTarget): string => (to.type === 'document' ? to.ref : to.type === 'path' ? to.path : to.url);

/**
 * Writes each row of a redirects CSV as a redirect of one site, origin
 * `import`, in one transaction. A row is skipped when its `from` redirects
 * already or a page is published there. A row whose `to` is another row's
 * `from`, or a stored redirect's, is written to where that one goes, and a
 * stored redirect that led to an imported `from` goes where it now goes.
 */
export const importRedirects = async (
    cms: CmsService,
    text: string,
    options: {
        site: string;
        author: string;
        dryRun: boolean;
    }
): Promise<ImportResult> => {
    const { site, author, dryRun } = options;
    const read = readRedirectCsv(text);
    const skipped = [...read.skipped];
    const stored = await cms.redirects.list(site);
    const storedFrom = new Map(stored.map((row) => [row.from, row]));
    const free: ImportRow[] = [];
    for (const row of read.rows) {
        const existing = storedFrom.get(row.from);
        const skip = (reason: SkipReason, detail: string): void => {
            skipped.push({
                line: row.line,
                from: row.from,
                to: row.to,
                reason,
                detail,
            });
        };
        if (existing !== undefined) {
            skip('redirects', `it redirects to ${shownTarget(existing.to)} already.`);
            continue;
        }
        const live = await pageLiveAt(cms, site, row.from);
        if (live !== undefined) {
            skip('live', `${live} is published there.`);
            continue;
        }
        free.push(row);
    }
    const collapsing = collapseRows(free);
    skipped.push(...collapsing.skipped);
    const collapsed = [...collapsing.collapsed];
    const working: PlannedRedirect[] = stored.map((row) => ({
        id: row.id,
        from: row.from,
        to: row.to,
    }));
    const repointed = new Map<string, RedirectTarget>();
    const written: Array<ImportRow & { target: RedirectTarget }> = [];
    for (const row of collapsing.rows) {
        const plan = planRedirect(working, {
            from: row.from,
            to: targetOfImported(row.to),
        });
        if ('refusal' in plan) {
            skipped.push({
                line: row.line,
                from: row.from,
                to: row.to,
                reason: 'loop',
                detail: plan.refusal,
            });
            continue;
        }
        const target = shownTarget(plan.to);
        if (target !== row.to) {
            const earlier = collapsed.find((candidate) => candidate.line === row.line);
            if (earlier === undefined) {
                collapsed.push({
                    line: row.line,
                    from: row.from,
                    to: row.to,
                    target,
                });
            } else {
                earlier.target = target;
            }
        }
        for (const each of plan.repointed) {
            const index = working.findIndex((candidate) => candidate.id === each.id);
            working[index] = each;
            if (storedFrom.get(each.from)?.id === each.id) repointed.set(each.id, each.to);
        }
        working.push({
            id: `import:${row.line}`,
            from: row.from,
            to: plan.to,
        });
        written.push({
            ...row,
            to: target,
            target: plan.to,
        });
    }
    if (!dryRun) {
        await cms.redirects.saveImport(
            site,
            written.map((row) => ({
                locale: localeOfPath(cms, site, row.from),
                from: row.from,
                to: row.target,
                status: row.status,
                createdBy: author,
            })),
            [...repointed].map(([id, to]) => ({
                id,
                to,
            }))
        );
    }
    return {
        site,
        dryRun,
        written: written.map(({ target: _, ...row }) => row),
        skipped: skipped.sort((left, right) => left.line - right.line),
        collapsed: collapsed.sort((left, right) => left.line - right.line),
    };
};
