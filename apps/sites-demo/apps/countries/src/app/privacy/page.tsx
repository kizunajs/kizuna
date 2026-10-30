import kizuna from '@kizunajs-demo/sites-content/config';

export const metadata = {
    title: 'Privacy policy',
};

export default async function PrivacyPage() {
    const policy = await kizuna.content.globals.privacyPolicy.get();
    return (
        <main>
            <h1>{policy.heading}</h1>
            <p>Last updated {policy.updatedOn}</p>
            {policy.body.split(/\n\s*\n/).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
            ))}
        </main>
    );
}
