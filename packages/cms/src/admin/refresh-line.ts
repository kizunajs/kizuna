/**
 * One site's or partner's refresh, as the refreshes route lists it.
 */
export interface Refresh {
    target: string;
    kind: 'site' | 'partner';
    label: string;
    status: 'queued' | 'answered' | 'retrying' | 'failed';
    attempts: number;
}

const counted = (answered: number, total: number, noun: string): string =>
    `${answered === total ? total : `${answered} of ${total}`} ${noun}${total === 1 ? '' : 's'}`;

/**
 * Names as a sentence lists them: "Hagen UK", "Hagen UK and Hagen Norge".
 */
const bothOf = (names: readonly string[]): string =>
    names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)!}`;

/**
 * How a publish reached the sites and partners that show it, as the
 * publish result reads it: "Refreshed 2 of 3 sites and 1 partner. Hagen
 * Norge did not answer, retrying." `undefined` when nothing was refreshed.
 */
export const refreshLineOf = (refreshes: readonly Refresh[]): string | undefined => {
    if (refreshes.length === 0) return undefined;
    const sites = refreshes.filter((refresh) => refresh.kind === 'site');
    const partners = refreshes.filter((refresh) => refresh.kind === 'partner');
    const answered = (list: readonly Refresh[]): number => list.filter((refresh) => refresh.status === 'answered').length;
    const parts = [
        ...(sites.length === 0 ? [] : [counted(answered(sites), sites.length, 'site')]),
        ...(partners.length === 0 ? [] : [counted(answered(partners), partners.length, 'partner')]),
    ];
    const labels = (status: Refresh['status']): string[] =>
        refreshes.filter((refresh) => refresh.status === status).map((refresh) => refresh.label);
    const retrying = labels('retrying');
    const failed = labels('failed');
    const queued = labels('queued');
    return [
        `Refreshed ${parts.join(' and ')}.`,
        ...(retrying.length === 0 ? [] : [`${bothOf(retrying)} did not answer, retrying.`]),
        ...(failed.length === 0 ? [] : [`${bothOf(failed)} did not answer.`]),
        ...(queued.length === 0 ? [] : [`${bothOf(queued)} ${queued.length === 1 ? 'has' : 'have'} not answered yet.`]),
    ].join(' ');
};
