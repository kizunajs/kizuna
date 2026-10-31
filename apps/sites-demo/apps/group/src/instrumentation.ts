/**
 * Runs the jobs on this server's clock, so scheduled drafts and releases
 * publish while `next dev` or `next start` runs. One app ticks for the
 * whole demo, and a schedule publishes once however many do.
 */
export async function register(): Promise<void> {
    if (process.env.NEXT_RUNTIME !== 'nodejs') return;
    const [{ startJobs }, { default: kizuna }] = await Promise.all([
        import('kizunajs/jobs'),
        import('@kizunajs-demo/sites-content/config'),
    ]);
    startJobs(kizuna.api);
}
