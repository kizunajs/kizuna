import kizuna from '@kizunajs-demo/sites-content/config';

export default async function AboutPage() {
    const page = await kizuna.content.of(['group']).pages.aboutPage.get();
    return (
        <main>
            <h1>{page.heading}</h1>
            {page.body.split(/\n\s*\n/).map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
            ))}
        </main>
    );
}
