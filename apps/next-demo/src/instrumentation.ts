/**
 * Runs the CMS's job on this server's clock, so scheduled drafts and releases
 * publish while `next dev` or `next start` runs.
 */
export async function register(): Promise<void> {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;
    const [{ startJobs }, { default: kizuna }] = await Promise.all([import('kizunajs/jobs'), import('@kizuna-config')]);
    startJobs(kizuna.api);
}
