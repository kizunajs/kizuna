import type { InProcessJobsConfig } from 'kizunajs';
import { defineJobTransport, type JobTransport } from 'kizunajs/adapter';

/**
 * A job runner for a test's CMS with sites: its refreshes are queued and
 * never delivered, so publishing calls no site.
 */
export const heldJobs: InProcessJobsConfig & { transport: JobTransport } = {
    mode: 'in-process',
    transport: defineJobTransport({
        name: 'held',
        dispatch: () => undefined,
    }),
};
