/**
 * pgmq refuses a queue name of 48 characters or more, since it prefixes the
 * name to build its table names.
 *
 * @see https://pgmq.github.io/pgmq/latest/api/sql/functions/
 */
const MAX_QUEUE_NAME_LENGTH = 47;

const QUEUE_NAME_PATTERN = /^[a-z0-9_]+$/;

const toSnakeCase = (segment: string): string =>
    segment
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .toLowerCase();

/**
 * `billing.reconcileInvoices` becomes `kizuna_billing_reconcile_invoices`.
 */
export const queueName = (prefix: string, jobKey: string): string => {
    const name = prefix + jobKey.split('.').map(toSnakeCase).join('_');
    if (!QUEUE_NAME_PATTERN.test(name)) {
        throw new Error(
            `Job "${jobKey}" becomes the pgmq queue "${name}", which holds characters other than lowercase letters, digits and underscores.`
        );
    }
    if (name.length > MAX_QUEUE_NAME_LENGTH) {
        throw new Error(
            `Job "${jobKey}" becomes the pgmq queue "${name}", which is ${name.length} characters. ` +
                `pgmq allows ${MAX_QUEUE_NAME_LENGTH}, so shorten the job's key or the prefix.`
        );
    }
    return name;
};

/**
 * Each job's queue, keyed by queue name, throwing when two jobs share one.
 */
export const queuesFor = (prefix: string, jobKeys: readonly string[]): Map<string, string> => {
    const jobByQueue = new Map<string, string>();
    for (const jobKey of jobKeys) {
        const name = queueName(prefix, jobKey);
        const claimant = jobByQueue.get(name);
        if (claimant !== undefined) {
            throw new Error(`Jobs "${claimant}" and "${jobKey}" both become the pgmq queue "${name}". Rename one of them.`);
        }
        jobByQueue.set(name, jobKey);
    }
    return jobByQueue;
};
